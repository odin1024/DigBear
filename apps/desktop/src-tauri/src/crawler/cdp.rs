//! 网络层抓取（Chrome DevTools Protocol）。
//!
//! DOM 扫描只能看到页面源码里写死的东西：`<img src>`、CSS 背景图、
//! `performance` 计时条目。真正难抓的是**运行时才出现的资源**——
//! `fetch` / XHR 返回的 JSON 里的媒体直链、`blob:` 开头的 MSE 流、
//! 动态插入的 `<video>`。
//!
//! 这些在网络层看得很清楚：WebView2 内置了 CDP，只要打开 `Network` 域，
//! 就能收到每一条请求的 URL。
//!
//! 目前只有 Windows（WebView2）实现；其它平台先用 DOM 扫描兜底。

#[cfg(windows)]
pub mod imp {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};

    use tauri::Manager;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2DevToolsProtocolEventReceivedEventArgs,
        ICoreWebView2DevToolsProtocolEventReceivedEventHandler,
    };
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
    }

    // 当前挂着的 CDP 事件处理器。
    //
    // WebView2 的事件回调是一次性的（每条事件都要重新注册），所以要留住
    // 最新的那一个。事件回调跑在 UI 线程上，用 thread_local 存最省事，
    // 也不用让 COM 句柄跨线程（COM 接口在 Rust 里不是 Send）。
    thread_local! {
        static HANDLER: std::cell::RefCell<Option<ICoreWebView2DevToolsProtocolEventReceivedEventHandler>> =
            const { std::cell::RefCell::new(None) };
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

        let started = Arc::new(AtomicBool::new(false));
        let started_for_webview = started.clone();

        let _ = win.with_webview(move |webview| {
            let controller = webview.controller();
            // SAFETY: controller 来自当前 WebView2 窗口，句柄由 WebView2 管理，
            // 这里只在它还活着的时候用。
            let Ok(core) = (unsafe { controller.CoreWebView2() }) else {
                eprintln!("[cdp] 拿不到 CoreWebView2");
                return;
            };
            let Ok(receiver) = (unsafe {
                core.GetDevToolsProtocolEventReceiver(&HSTRING::from(
                    "DevToolsProtocolEventReceived",
                ))
            }) else {
                eprintln!("[cdp] 拿不到 DevTools 事件接收器");
                return;
            };

            // 先挂上事件监听，再打开 Network 域 —— 顺序反了会漏掉最早那批请求。
            register(&receiver, &hits);

            let done = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                move |hr, _message| {
                    if hr.is_ok() {
                        started_for_webview.store(true, Ordering::Relaxed);
                        eprintln!("[cdp] Network.enable 成功");
                    } else {
                        eprintln!("[cdp] Network.enable 失败: {hr:?}");
                    }
                    Ok(())
                },
            ));
            // SAFETY: 参数都是刚构造的字符串，回调对象由 WebView2 持有。
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
        });

        if started.load(Ordering::Relaxed) {
            Ok(())
        } else {
            // Network.enable 是异步的，这里先不当作失败；调用结果稍后由回调打印。
            Ok(())
        }
    }

    /// 注册一次事件监听；回调触发后会立刻再注册一次。
    fn register(
        receiver: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2DevToolsProtocolEventReceiver,
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

        // handler 必须一直活着，否则 COM 对象一释放就收不到事件了。
        HANDLER.with(|cell| {
            if let Ok(mut guard) = cell.try_borrow_mut() {
                *guard = Some(handler.clone());
            }
        });

        let mut token: i64 = 0;
        // SAFETY: 事件接收器与 handler 都是刚拿到的 COM 对象，handler 的生命周期
        // 由上面的 thread_local 兜着；token 只是 WebView2 内部的句柄。
        let added = unsafe { receiver.add_DevToolsProtocolEventReceived(&handler, &mut token) };
        if added.is_err() {
            eprintln!("[cdp] 注册 DevTools 事件监听失败");
        }
    }

    /// 从事件参数里取出 CDP 的 JSON 文本。
    fn read_event_json(
        args: &ICoreWebView2DevToolsProtocolEventReceivedEventArgs,
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
    fn collect_hit(json: &str, hits: &Arc<Mutex<Vec<NetworkHit>>>) {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
            return;
        };
        let method = value.get("method").and_then(|v| v.as_str()).unwrap_or("");
        if method != "Network.responseReceived" {
            return;
        }
        let Some(response) = value.get("params").and_then(|v| v.get("response")) else {
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
    }

    pub fn watch(
        _app: &tauri::AppHandle,
        _label: &str,
        _hits: Arc<Mutex<Vec<NetworkHit>>>,
    ) -> Result<(), String> {
        Err("当前平台暂不支持网络层抓取".to_string())
    }
}
