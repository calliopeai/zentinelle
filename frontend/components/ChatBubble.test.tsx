// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatMessage } from "@/components/ChatBubble";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderAnswer(content: string) {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const { container } = render(
    <ChatMessage
      message={{
        id: "m1",
        role: "assistant",
        content,
        timestamp: new Date(0),
      }}
    />,
  );
  return { container, fetchSpy };
}

// Every attribute the URL turns up in, as tag[attribute]. Only an a[href]
// waits for a click; src, srcset, poster, style and the rest load on render.
function placesOf(url: string, root: HTMLElement): string[] {
  return [...root.querySelectorAll("*")].flatMap((el) =>
    [...el.attributes]
      .filter((attr) => attr.value.includes(url))
      .map((attr) => `${el.tagName.toLowerCase()}[${attr.name}]`),
  );
}

describe("markdown images in an assistant answer", () => {
  it("render as a link to the image, not as an image", () => {
    const url = "https://images.example.test/chart.png?q=1";
    const { container, fetchSpy } = renderAnswer(
      `Here is the chart: ![quarterly chart](${url})`,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(placesOf(url, container)).toEqual(["a[href]"]);
    const link = container.querySelector("a");
    expect(link?.textContent).toBe("quarterly chart");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("label the link with the URL when the image has no alt text", () => {
    const url = "https://images.example.test/a.png";
    const { container } = renderAnswer(`![](${url})`);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")?.textContent).toBe(url);
  });

  it("do not load through a reference definition", () => {
    const url = "https://images.example.test/logo.png";
    const { container, fetchSpy } = renderAnswer(`![logo][1]\n\n[1]: ${url}`);

    expect(container.querySelector("img")).toBeNull();
    expect(placesOf(url, container)).toEqual(["a[href]"]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("do not load from raw HTML", () => {
    const url = "https://images.example.test/raw.png";
    const { container, fetchSpy } = renderAnswer(
      `Look: <img src="${url}" alt="raw">`,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(placesOf(url, container)).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("render as text inside a link, so links never nest", () => {
    const image = "https://images.example.test/badge.svg";
    const { container } = renderAnswer(
      `[![build badge](${image})](https://docs.example.test/build)`,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(placesOf(image, container)).toEqual([]);
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe(
      "https://docs.example.test/build",
    );
    expect(links[0].textContent).toBe("build badge");
  });
});
