/** Keep page-relative coordinates identical for an element or the browser document. */
export function scrollPort(element: HTMLElement, documentScroll = false) {
  const view = element.ownerDocument.defaultView!;
  const origin = () => {
    const box = element.getBoundingClientRect();
    return { left: box.left + view.scrollX, top: box.top + view.scrollY };
  };
  return {
    target: documentScroll ? view : element,
    read() {
      if (!documentScroll)
        return {
          left: element.scrollLeft,
          top: element.scrollTop,
          width: element.clientWidth,
          height: element.clientHeight,
        };
      const offset = origin();
      return {
        left: view.scrollX - offset.left,
        top: view.scrollY - offset.top,
        width: view.document.documentElement.clientWidth,
        height: view.visualViewport?.height || view.innerHeight,
      };
    },
    to(options: ScrollToOptions) {
      if (!documentScroll) {
        element.scrollTo(options);
        return;
      }
      const offset = origin();
      view.scrollTo({
        ...options,
        top:
          options.top === undefined ? view.scrollY : offset.top + options.top,
        left:
          options.left === undefined
            ? view.scrollX
            : offset.left + options.left,
      });
    },
  };
}
