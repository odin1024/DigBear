//! 网络层抓取（Chrome DevTools Protocol）。
//!
//! DOM 扫描只能看到页面源码里写死的东西：`<img src>`、CSS 背景图、
//! `performance` 计时条目。真正难抓的是**运行时才出现的资源**——
//! `fetch` / XHR 返回的 JSON 里的媒体直链、动态插入的 `<video>`。
//!
//! 这些在网络层看得很清楚：WebView2 内置了 CDP，只要打开 `Network` 域，
//! 就能收到每一条请求的 URL。
//!
//! 目前只有 Windows（WebView2）实现；其它平台先用 DOM 扫描兜底。

#[cfg(windows)]
pub mod imp {
    use std::sync::{Arc, Mutex};

    use tauri::Manager;
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2DevToolsProtocolEventReceiver;
    use webview2_com::{
        CallDevToolsProtocolMethodCompletedHandler, DevToolsProtocolEventReceivedEventHandler,
    };
    use windows::core::{HSTRING, PWSTR};
    use windows::Win32::System::Com::CoTaskMemFree;

    /// 抓到的一条网络请求。
    #[derive(Debug, Clone)]
    pub struct NetworkHit {
        pub url: String,
        pub mime: String,
        pub status: i64,
        /// CDP 的请求编号，取响应体时要用（下一步的「接口 JSON 挖直链」会用到）。
        #[allow(dead_code)]
        pub request_id: i64,
    }

    /// 在指定窗口上打开 CDP 的 `Network` 域，并把请求记录进共享列表。
    pub fn watch(
        app: &tauri::AppHandle,
        label: &str,
        hits: Arc<Mutex<Vec<NetworkHit>>>,
    ) -> Result<(), String> {
        let Some(win) = app.get_webview_window(label) else {
            return Err(format!("找不到窗口 {label}"));
        };

        let (done_tx, done_rx) = std::sync::mpsc::channel::<()>();
        let hits_for_webview = hits.clone();

        let _ = win.with_webview(move |webview| {
            let controller = webview.controller();
            // SAFETY: controller 来自当前 WebView2 窗口，句柄由 WebView2 管理。
            let Ok(core) = (unsafe { controller.CoreWebView2() }) else {
                eprintln!("[cdp] 拿不到 CoreWebView2");
                let _ = done_tx.send(());
                return;
            };
            // 这里要传的是 CDP 的事件名，不是 WebView2 的接口名。
            let Ok(receiver) = (unsafe {
                core.GetDevToolsProtocolEventReceiver(&HSTRING::from("Network.responseReceived"))
            }) else {
                eprintln!("[cdp] 拿不到 DevTools 事件接收器");
                let _ = done_tx.send(());
                return;
            };

            // WebView2 的事件回调是一次性的：每条事件都要重新挂一个，
            // 挂上之后才会继续收到后面的事件。
            register(&receiver, &hits_for_webview);

            // 先挂监听再打开 Network 域 —— 顺序反了会漏掉最早那批请求。
            let done = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                move |hr, _message| {
                    if hr.is_err() {
                        eprintln!("[cdp] Network.enable 失败: {hr:?}");
                    }
                    Ok(())
                },
            ));
            // SAFETY: 参数是刚构造的字符串，回调对象由 WebView2 持有。
            let enabled = unsafe {
                core.CallDevToolsProtocolMethod(
                    &HSTRING::from("Network.enable"),
                    &HSTRING::from("{}"),
                    &done,
                )
            };
            if enabled.is_err() {
                eprintln!("[cdp] 调用 Network.enable 失败");
            }
            let _ = done_tx.send(());
        });
        // with_webview 是投递到 UI 线程异步执行的，等它真的跑完再返回。
        let _ = done_rx.recv_timeout(std::time::Duration::from_secs(10));
        Ok(())
    }

    /// 挂一次事件监听；回调触发后会立刻再挂一次，接着收下一条。
    fn register(
        receiver: &ICoreWebView2DevToolsProtocolEventReceiver,
        hits: &Arc<Mutex<Vec<NetworkHit>>>,
    ) {
        let receiver_for_event = receiver.clone();
        let hits_for_event = hits.clone();

        let handler =
            DevToolsProtocolEventReceivedEventHandler::create(Box::new(move |_webview, args| {
                if let Some(args) = args {
                    if let Some(json) = read_event_json(&args) {
                        collect_hit(&json, &hits_for_event);
                    }
                }
                // 事件回调是一次性的，重新挂一个接着收。
                register(&receiver_for_event, &hits_for_event);
                Ok(())
            }));

        let mut token: i64 = 0;
        // SAFETY: 事件接收器与 handler 都是刚拿到的 COM 对象；handler 在注册后
        // 由 WebView2 持有引用，token 只是 WebView2 内部的句柄。
        let added = unsafe { receiver.add_DevToolsProtocolEventReceived(&handler, &mut token) };
        if added.is_err() {
            eprintln!("[cdp] 注册 DevTools 事件监听失败");
        }
    }

    /// 从事件参数里取出 CDP 的 JSON 文本。
    fn read_event_json(
        args: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2DevToolsProtocolEventReceivedEventArgs,
    ) -> Option<String> {
        let mut buffer = PWSTR::null();
        // SAFETY: 传的是 PWSTR 的可变引用，WebView2 会往里写一块 CoTaskMem 内存。
        unsafe { args.ParameterObjectAsJson(&mut buffer) }.ok()?;
        if buffer.is_null() {
            return None;
        }
        // SAFETY: PWSTR 指向 WebView2 分配的那块 CoTaskMem 内存。
        let text = unsafe { buffer.to_string() }.ok();
        // 这块内存是 WebView2 用 CoTaskMem 分配的，得我们负责还回去。
        unsafe {
            CoTaskMemFree(Some(buffer.0 as *const _));
        }
        text
    }

    /// 从 CDP 事件里挑出值得记录的请求。
    ///
    /// 注意：`GetDevToolsProtocolEventReceiver` 给回来的 JSON 已经是
    /// `Network.responseReceived` 事件的**参数本身**（没有 method 字段），
    /// 所以直接从 `response` 里取信息。
    fn collect_hit(json: &str, hits: &Arc<Mutex<Vec<NetworkHit>>>) {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
            return;
        };
        let Some(response) = value.get("response") else {
            return;
        };
        let Some(url) = response.get("url").and_then(|v| v.as_str()) else {
            return;
        };
        let mime = response
            .get("mimeType")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let status = response.get("status").and_then(|v| v.as_i64()).unwrap_or(0);
        if let Ok(mut list) = hits.lock() {
            if list.iter().any(|hit| hit.url == url) {
                return;
            }
            list.push(NetworkHit {
                url: url.to_string(),
                mime,
                status,
                request_id: value.get("requestId").and_then(|v| v.as_i64()).unwrap_or(0),
            });
        }
    }
}

/// 非 Windows 平台暂时不支持网络层抓取。
#[cfg(not(windows))]
pub mod imp {
    use std::sync::{Arc, Mutex};

    #[derive(Debug, Clone)]
    pub struct NetworkHit {
        pub url: String,
        pub mime: String,
        pub status: i64,
        pub request_id: i64,
    }

    pub fn watch(
        _app: &tauri::AppHandle,
        _label: &str,
        _hits: Arc<Mutex<Vec<NetworkHit>>>,
    ) -> Result<(), String> {
        Err("当前平台暂不支持网络层抓取".to_string())
    }
}
