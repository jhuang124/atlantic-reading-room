/** Keep page-relative coordinates identical for an element or the browser
 * document. In document mode the browser owns the vertical scroll (so its
 * toolbars can collapse) and the element owns the horizontal one: a magnified
 * page pans inside the element and never widens the document, which on phones
 * would widen the layout viewport and stretch fixed chrome with it. */
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
        left: element.scrollLeft,
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
      if (options.left !== undefined) element.scrollLeft = options.left;
      if (options.top !== undefined)
        view.scrollTo({
          ...options,
          left: view.scrollX,
          top: offset.top + options.top,
        });
    },
  };
}
