//! 磁盘剩余空间查询。
//!
//! 下载前先看一眼目标盘还剩多少，避免下到一半才发现磁盘满了。

/// 返回 `(可用空间, 总容量)`，单位字节。取不到时返回 None。
#[cfg(windows)]
pub fn free_space(path: &std::path::Path) -> Option<(u64, u64)> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    // 取路径所在卷：先找最近的已存在祖先
    let mut probe = path.to_path_buf();
    while !probe.exists() {
        match probe.parent() {
            Some(parent) => probe = parent.to_path_buf(),
            None => return None,
        }
    }
    let wide: Vec<u16> = probe
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut available: u64 = 0;
    let mut total: u64 = 0;
    let mut total_free: u64 = 0;
    // SAFETY: wide 以 NUL 结尾，三个输出指针均指向有效的局部变量。
    let ok = unsafe {
        GetDiskFreeSpaceExW(
            PCWSTR(wide.as_ptr()),
            Some(&mut available),
            Some(&mut total),
            Some(&mut total_free),
        )
        .is_ok()
    };
    if ok {
        Some((available, total))
    } else {
        None
    }
}

/// 非 Windows 平台暂不支持，返回 None。
#[cfg(not(windows))]
pub fn free_space(_path: &std::path::Path) -> Option<(u64, u64)> {
    None
}

/// 把字节数格式化成人类可读的大小。
pub fn human_size(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes as f64;
    let mut unit = 0usize;
    while value >= 1024.0 && unit + 1 < UNITS.len() {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} B")
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

#[cfg(test)]
mod tests {
    use super::human_size;

    #[test]
    fn formats_sizes() {
        assert_eq!(human_size(512), "512 B");
        assert_eq!(human_size(2048), "2.0 KB");
        assert_eq!(human_size(5 * 1024 * 1024), "5.0 MB");
        assert_eq!(human_size(3 * 1024 * 1024 * 1024), "3.0 GB");
    }
}
