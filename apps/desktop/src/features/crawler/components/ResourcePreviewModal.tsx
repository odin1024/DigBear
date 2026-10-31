import { useEffect, useState } from "react";
import { App as AntApp, Modal } from "antd";
import { motion, useReducedMotion } from "framer-motion";
import { api, type MediaResource } from "../../../shared/api";
import {
  KIND_LABELS,
  formatDimensions,
  formatDuration,
  resourceName,
  safeImageUrl,
} from "../../../shared/format";
import { ExternalIcon, kindIcon } from "../../../shared/components/Icons";
import { t } from "../../../shared/i18n";

interface ResourcePreviewModalProps {
  resource: MediaResource | null;
  onClose: () => void;
}

function remoteUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

/** Recognize YouTube watch / embed / shorts / youtu.be URLs. */
function youtubeId(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] ?? null;
    }
    if (!/(^|\.)youtube(-nocookie)?\.com$/.test(host)) return null;
    const fromQuery = url.searchParams.get("v");
    if (fromQuery) return fromQuery;
    const match = url.pathname.match(/\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{6,})/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/** A URL we can hand straight to a <video> element. */
function isDirectVideo(value: string): boolean {
  return /\.(mp4|m4v|webm|mov|ogv|ogg|m3u8|mpd)(?:[?#]|$)/i.test(value);
}

export function ResourcePreviewModal({ resource, onClose }: ResourcePreviewModalProps) {
  const { message } = AntApp.useApp();
  const reduceMotion = useReducedMotion();
  const [imageFailed, setImageFailed] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [fontState, setFontState] = useState<"loading" | "ready" | "failed">("loading");
  const resourceId = resource?.id ?? "";

  useEffect(() => {
    setImageFailed(false);
    setThumbFailed(false);
    setVideoFailed(false);
    setFontState("loading");
  }, [resourceId]);

  useEffect(() => {
    if (!resource || resource.kind !== "font") return undefined;
    let alive = true;
    const src = remoteUrl(resource.url);
    if (!src) {
      setFontState("failed");
      return undefined;
    }
    const family = `cb-preview-${resource.id}`;
    const face = new FontFace(family, `url("${src.replace(/"/g, "%22")}")`);
    face
      .load()
      .then((loaded) => {
        if (!alive) return;
        document.fonts.add(loaded);
        setFontState("ready");
      })
      .catch(() => {
        if (alive) setFontState("failed");
      });
    return () => {
      alive = false;
    };
  }, [resource]);

  if (!resource) return null;

  const name = resourceName(resource);
  const KindIcon = kindIcon(resource.kind);
  const dimensions = formatDimensions(resource.width, resource.height);
  const duration = formatDuration(resource.duration);
  const image = safeImageUrl(resource.url);
  const media = remoteUrl(resource.url);
  const poster = safeImageUrl(resource.poster);
  const videoEmbed = resource.kind === "video" ? youtubeId(media) : null;
  const videoDirect = resource.kind === "video" && isDirectVideo(media);
  const videoPageOnly = resource.kind === "video" && !videoEmbed && !videoDirect;
  const youtubeThumb = videoEmbed ? `https://i.ytimg.com/vi/${videoEmbed}/hqdefault.jpg` : "";
  const pageThumb = youtubeThumb || poster;

  const openExternal = () => {
    if (!media) return;
    void api.openUrl(media).catch((error) => {
      message.error(error instanceof Error ? error.message : t("无法打开浏览器。", "Could not open the browser."));
    });
  };

  const openVideoWindow = (url: string) => {
    if (!url) return;
    void api
      .openVideoPreview(url, t(`视频预览 · ${name}`, `Video preview · ${name}`))
      .then(() => onClose())
      .catch((error) => {
        message.error(error instanceof Error ? error.message : t("无法打开视频窗口。", "Could not open the video window."));
      });
  };

  const openYouTube = () => {
    if (!videoEmbed) return;
    // A top-level watch page avoids YouTube's embed/referrer restrictions (error 153).
    openVideoWindow(`https://www.youtube.com/watch?v=${videoEmbed}`);
  };

  return (
    <Modal
      open
      onCancel={onClose}
      footer={null}
      centered
      width={Math.min(900, typeof window !== "undefined" ? window.innerWidth - 80 : 820)}
      className="preview-modal"
      destroyOnClose
      title={
        <span className="preview-modal__title">
          <span className="preview-modal__kind">
            <KindIcon size={13} />
            {KIND_LABELS[resource.kind]}
          </span>
          <span title={name}>{name}</span>
        </span>
      }
    >
      <motion.div
        className="preview-modal__stage"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        {resource.kind === "image" && (
          imageFailed ? (
            <div className="preview-modal__fallback">
              <KindIcon size={40} />
              <p>{t("这张图暂时加载不出来，可以直接收进采集袋再查看。", "This image could not be loaded. Save it and inspect it locally.")}</p>
            </div>
          ) : (
            <img
              src={image}
              alt={resource.alt || name}
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
            />
          )
        )}

        {resource.kind === "video" && videoEmbed && (
          <button
            type="button"
            className="preview-modal__video-page"
            onClick={openYouTube}
            title={t("在独立窗口播放", "Play in a separate window")}
          >
            {!thumbFailed ? (
              <img
                src={youtubeThumb}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setThumbFailed(true)}
              />
            ) : (
              <span className="preview-modal__video-page-icon" aria-hidden="true">
                <KindIcon size={52} />
              </span>
            )}
            <span className="preview-modal__video-page-overlay">
              <span>{t("YouTube 视频", "YouTube video")}</span>
              <strong>{t("在独立窗口播放 →", "Play in a separate window →")}</strong>
            </span>
          </button>
        )}

        {resource.kind === "video" && videoDirect && !videoFailed && (
          <video
            className="preview-modal__video"
            src={media}
            poster={poster || undefined}
            controls
            playsInline
            preload="metadata"
            onError={() => setVideoFailed(true)}
          />
        )}

        {resource.kind === "video" && videoDirect && videoFailed && (
          <div className="preview-modal__fallback">
            <KindIcon size={40} />
            <p>{t("这个视频无法内嵌播放，可能是站点 CDN 的跨域限制。", "This video cannot play inline, likely due to a CDN cross-origin restriction.")}</p>
            <button
              type="button"
              className="rb-text-link"
              onClick={() => openVideoWindow(media)}
            >
              {t("在独立窗口播放", "Play in a separate window")}
            </button>
          </div>
        )}

        {videoPageOnly && (
          <button
            type="button"
            className="preview-modal__video-page"
            onClick={() => openVideoWindow(media)}
            title={t("在独立窗口播放", "Play in a separate window")}
          >
            {pageThumb && !thumbFailed ? (
              <img
                src={pageThumb}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setThumbFailed(true)}
              />
            ) : (
              <span className="preview-modal__video-page-icon" aria-hidden="true">
                <KindIcon size={52} />
              </span>
            )}
            <span className="preview-modal__video-page-overlay">
              <span>{t("这个地址是视频页面", "This URL is a video page")}</span>
              <strong>{t("在独立窗口播放 →", "Play in a separate window →")}</strong>
            </span>
          </button>
        )}

        {resource.kind === "audio" && (
          <div className="preview-modal__audio">
            {poster ? (
              <img src={poster} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="preview-modal__audio-icon" aria-hidden="true">
                <KindIcon size={44} />
              </span>
            )}
            <audio src={media} controls preload="metadata" />
          </div>
        )}

        {resource.kind === "font" && (
          <div className="preview-modal__font">
            {fontState === "ready" ? (
              <p
                className="preview-modal__font-sample"
                style={{ fontFamily: `cb-preview-${resource.id}` }}
              >
                {t("掘掘熊 DigBear 0123456789", "DigBear 0123456789")}
              </p>
            ) : (
              <p className="preview-modal__font-sample">
                {fontState === "loading" ? t("正在加载字体…", "Loading font…") : t("这个字体无法在线预览", "This font cannot be previewed online")}
              </p>
            )}
            <p className="preview-modal__font-note">
              {fontState === "failed"
                ? t("字体文件受站点保护，收进采集袋后可在本机安装查看。", "The font file is protected by the site. Save it and install it locally.")
                : t("字体仅在预览窗口内加载，不会安装到系统。", "The font is loaded only for this preview and is not installed.")}
            </p>
          </div>
        )}
      </motion.div>

      <div className="preview-modal__footer">
        <div className="preview-modal__meta">
          <span>{resource.host || "—"}</span>
          {dimensions && <span>{dimensions}</span>}
          {duration && <span>{duration}</span>}
          <span className="preview-modal__url" title={resource.url}>
            {resource.url}
          </span>
        </div>
        {media && (
          <button type="button" className="rb-text-link preview-modal__open" onClick={openExternal}>
            <ExternalIcon size={13} />
            {t("在浏览器中打开", "Open in browser")}
          </button>
        )}
      </div>
      {videoPageOnly && (
        <p className="preview-modal__note">
          {t("目前仅 YouTube 播放页支持应用内下载，其他站点的视频页暂不支持。", "In-app download currently supports YouTube pages only.")}
        </p>
      )}
    </Modal>
  );
}
