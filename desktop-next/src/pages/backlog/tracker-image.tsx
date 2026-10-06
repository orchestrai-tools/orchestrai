import { daemon } from "@warpforge/daemon";
import { ImageIcon } from "lucide-react";
import { useEffect, useState, type ComponentProps } from "react";

import { openExternalLink } from "../../lib/external-link";

/** Data URLs by source URL, held for the session so a reopened item shows its screenshots at once. */
const loaded = new Map<string, Promise<string | null>>();

function attachment(src: string): Promise<string | null> {
  let pending = loaded.get(src);
  if (!pending) {
    pending = daemon.trackerAttachment(src).then(
      (data) => `data:${data.contentType};base64,${data.dataBase64}`,
      () => null,
    );
    loaded.set(src, pending);
  }
  return pending;
}

const isRemote = (src: string) => /^https?:\/\//i.test(src);

/**
 * An image from a tracker issue body. The WebView holds no GitHub or Linear
 * session, so a plain `<img>` at a private attachment gets a 404; the daemon
 * fetches the bytes with the credentials the import used. Anything it cannot
 * fetch degrades to a link to the original. Elements are spans because
 * markdown places images inside paragraphs.
 */
export function TrackerImage({ src, alt, title }: ComponentProps<"img">) {
  const url = typeof src === "string" ? src : "";
  const [data, setData] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isRemote(url)) return;
    let live = true;
    void attachment(url).then((next) => live && setData(next));
    return () => {
      live = false;
    };
  }, [url]);

  if (!isRemote(url)) return <img src={url} alt={alt} title={title} />;
  const open = () => void openExternalLink(url);

  if (data === undefined) {
    return (
      <span
        role="status"
        aria-label={alt || "Loading image"}
        className="my-2 block aspect-video max-w-sm animate-pulse rounded-md bg-muted"
      />
    );
  }
  if (data === null) {
    return (
      <a
        href={url}
        onClick={(event) => {
          event.preventDefault();
          open();
        }}
        className="inline-flex items-center gap-1"
      >
        <ImageIcon className="size-3.5" aria-hidden />
        {alt || "Image"}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      title={title || "Open the original"}
      className="my-2 block max-w-full cursor-zoom-in rounded-md"
    >
      <img src={data} alt={alt} className="my-0 max-h-96 rounded-md border" />
    </button>
  );
}
