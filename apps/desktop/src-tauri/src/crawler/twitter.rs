//! Normalize X/Twitter video resources.
//!
//! The DOM and performance entries expose a mix of audio-only tracks, low HLS
//! variants and direct MP4 variants. The raw tweet page still contains the HLS
//! master playlists. Keep one best video resource per tweet video:
//! master HLS when available, otherwise the highest-resolution direct MP4.

use crate::core::models::{MediaKind, MediaResource, ResourceSource};
use regex::Regex;
use std::collections::HashMap;
use tauri::AppHandle;

fn amplify_video_id(url: &str) -> Option<String> {
    if !url.contains("video.twimg.com") {
        return None;
    }
    Regex::new(r"/amplify_video/(\d+)/")
        .ok()?
        .captures(url)?
        .get(1)
        .map(|value| value.as_str().to_string())
}

fn is_audio_asset(url: &str) -> bool {
    url.contains("/aud/") || url.contains("/pl/mp4a/")
}

fn is_hls_variant(url: &str) -> bool {
    url.contains("/pl/avc1/")
}

fn hls_master(url: &str) -> bool {
    url.contains("/pl/") && url.contains(".m3u8") && !is_hls_variant(url) && !is_audio_asset(url)
}

fn direct_resolution(url: &str) -> Option<(u32, u32)> {
    let path = url.split('?').next().unwrap_or(url);
    let captures = Regex::new(r"/(\d{2,5})x(\d{2,5})/").ok()?.captures(path)?;
    let width = captures.get(1)?.as_str().parse().ok()?;
    let height = captures.get(2)?.as_str().parse().ok()?;
    Some((width, height))
}

fn is_direct_mp4(url: &str) -> bool {
    url.contains("/vid/avc1/") && url.split('?').next().unwrap_or(url).ends_with(".mp4")
}

fn filename(url: &str) -> Option<String> {
    url.split('?')
        .next()
        .and_then(|value| value.rsplit('/').next())
        .map(str::to_string)
}

pub async fn normalize_video_resources(
    app: &AppHandle,
    page_url: &str,
    resources: &mut Vec<MediaResource>,
) -> bool {
    let is_x_page = url::Url::parse(page_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
        .map(|host| host == "x.com" || host.ends_with(".x.com") || host == "twitter.com" || host.ends_with(".twitter.com"))
        .unwrap_or(false);
    if !is_x_page {
        return false;
    }

    let has_video_resource = resources.iter().any(|resource| {
        resource.kind == MediaKind::Video && amplify_video_id(&resource.url).is_some()
    });
    let masters: HashMap<String, String> =
        crate::downloader::hls::twitter_masters_for_page(app, page_url)
            .await
            .into_iter()
            .collect();

    if masters.is_empty() && !has_video_resource {
        return false;
    }

    let mut templates: HashMap<String, MediaResource> = HashMap::new();
    for resource in resources.iter() {
        if resource.kind != MediaKind::Video {
            continue;
        }
        if let Some(id) = amplify_video_id(&resource.url) {
            templates.entry(id).or_insert_with(|| resource.clone());
        }
    }

    let mut chosen: HashMap<String, (String, Option<(u32, u32)>)> = HashMap::new();
    for (id, template) in &templates {
        // Use the highest resolution seen on any direct MP4 for the card metadata,
        // but download through the HLS master. X's standalone MP4 URLs are often
        // header-only placeholders; the master contains the real 1080p/1440p variant.
        let dimensions = resources
            .iter()
            .filter(|resource| amplify_video_id(&resource.url).as_deref() == Some(id.as_str()))
            .filter_map(|resource| direct_resolution(&resource.url))
            .max_by_key(|(width, height)| (*width as u64) * (*height as u64));
        let master = masters.get(id).cloned().or_else(|| {
            resources.iter().find_map(|resource| {
                (amplify_video_id(&resource.url).as_deref() == Some(id.as_str())
                    && hls_master(&resource.url))
                .then(|| resource.url.clone())
            })
        });
        if let Some(master) = master {
            chosen.insert(id.clone(), (master, dimensions));
            continue;
        }

        let direct = resources
            .iter()
            .filter(|resource| amplify_video_id(&resource.url).as_deref() == Some(id.as_str()))
            .filter(|resource| is_direct_mp4(&resource.url))
            .filter_map(|resource| {
                direct_resolution(&resource.url).map(|res| (res, resource.url.clone()))
            })
            .max_by_key(|((width, height), _)| (*width as u64) * (*height as u64));
        if let Some((dimensions, url)) = direct {
            chosen.insert(id.clone(), (url, Some(dimensions)));
            continue;
        }

        // Last resort: keep the first non-audio URL for this video id.
        let fallback = resources.iter().find_map(|resource| {
            (amplify_video_id(&resource.url).as_deref() == Some(id.as_str())
                && !is_audio_asset(&resource.url))
            .then(|| resource.url.clone())
        });
        chosen.insert(id.clone(), (fallback.unwrap_or_else(|| template.url.clone()), dimensions));
    }
    let mut output = Vec::with_capacity(resources.len());
    let mut emitted: HashMap<String, bool> = HashMap::new();
    for resource in resources.drain(..) {
        let Some(id) = amplify_video_id(&resource.url) else {
            output.push(resource);
            continue;
        };
        if emitted.contains_key(&id) {
            continue;
        }
        let Some(template) = templates.get(&id) else {
            continue;
        };
        let Some((url, dimensions)) = chosen.get(&id) else {
            continue;
        };
        let mut normalized = template.clone();
        normalized.url = url.clone();
        normalized.filename_hint = filename(url);
        if let Some((width, height)) = dimensions {
            normalized.width = Some(*width);
            normalized.height = Some(*height);
        }
        output.push(normalized);
        emitted.insert(id, true);
    }

    let mut added_ids: Vec<String> = masters.keys().cloned().collect();
    added_ids.sort();
    for id in added_ids {
        if emitted.contains_key(&id) {
            continue;
        }
        let Some(master) = masters.get(&id) else { continue };
        let parsed = url::Url::parse(master).ok();
        output.push(MediaResource {
            id: format!("x-video-{id}"),
            url: master.clone(),
            kind: MediaKind::Video,
            source: ResourceSource::Link,
            filename_hint: filename(master),
            width: None,
            height: None,
            duration: None,
            poster: None,
            alt: None,
            host: parsed
                .as_ref()
                .and_then(|url| url.host_str())
                .unwrap_or("video.twimg.com")
                .to_string(),
        });
        emitted.insert(id, true);
    }

    *resources = output;
    !masters.is_empty() || has_video_resource
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_video_ids_only() {
        assert_eq!(
            amplify_video_id("https://video.twimg.com/amplify_video/123/pl/avc1/960x720/a.m3u8")
                .as_deref(),
            Some("123")
        );
        assert_eq!(amplify_video_id("https://example.com/video.mp4"), None);
    }

    #[test]
    fn recognizes_audio_and_direct_assets() {
        assert!(is_audio_asset(
            "https://video.twimg.com/amplify_video/1/pl/mp4a/128000/a.m3u8"
        ));
        assert!(is_audio_asset(
            "https://video.twimg.com/amplify_video/1/aud/mp4a/0/0/32000/a.mp4"
        ));
        assert!(hls_master(
            "https://video.twimg.com/amplify_video/1/pl/master.m3u8"
        ));
        assert!(!hls_master(
            "https://video.twimg.com/amplify_video/1/pl/avc1/960x720/a.m3u8"
        ));
        assert_eq!(
            direct_resolution(
                "https://video.twimg.com/amplify_video/1/vid/avc1/0/0/1640x720/a.mp4"
            ),
            Some((1640, 720))
        );
    }
}
