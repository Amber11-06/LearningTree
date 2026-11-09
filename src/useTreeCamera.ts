import { useCallback, useLayoutEffect, useRef } from "react";
import {
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  useStore,
  useStoreApi,
  type Viewport,
} from "@xyflow/react";
import type { SkillNode } from "./skill-graph";
import {
  flushTreeViewport,
  readTreeViewport,
  rememberTreeViewport,
  restoreTreeViewport,
} from "./tree-viewport";

export type SkillFocusRequest = {
  treeId: string;
  nodeId: string;
  sequence: number;
};
type Camera = {
  key: string;
  treeId: string;
  compact: boolean;
  width: number;
  height: number;
  viewport: Viewport;
  automatic: boolean;
  handledFocus: string | null;
};

export function useTreeCamera({
  treeId,
  compact,
  nodes,
  focusRequest,
  onFocusHandled,
  reduced,
}: {
  treeId: string;
  compact: boolean;
  nodes: SkillNode[];
  focusRequest?: SkillFocusRequest;
  onFocusHandled?: (request: SkillFocusRequest) => void;
  reduced: boolean;
}) {
  const flow = useReactFlow<SkillNode>();
  const store = useStoreApi<SkillNode>();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const initialized = useStore((state) => !!state.panZoom);
  const active = useRef<Camera | null>(null);
  const rawBounds = getNodesBounds(nodes);
  // Leave a small top inset for the floating map controls.
  const bounds = compact
    ? rawBounds
    : {
        ...rawBounds,
        y: rawBounds.y - 24,
        height: rawBounds.height + 24,
      };
  const requestedNode =
    focusRequest?.treeId === treeId
      ? nodes.find((node) => node.id === `topic:${focusRequest.nodeId}`)
      : undefined;
  const requestKey = focusRequest
    ? `${focusRequest.treeId}:${focusRequest.nodeId}:${focusRequest.sequence}`
    : null;

  const save = useCallback((camera: Camera, viewport: Viewport) => {
    camera.viewport = { ...viewport };
    rememberTreeViewport(camera.treeId, camera.compact, {
      ...viewport,
      width: camera.width,
      height: camera.height,
    });
  }, []);

  // Subscribe to the actual camera transform, including internal/programmatic moves.
  // The active camera ref owns the tree ID, so a delayed callback cannot write B's view to A.
  useLayoutEffect(() => {
    const unsubscribe = store.subscribe((state, previous) => {
      const camera = active.current;
      if (!camera || !state.panZoom || state.transform === previous.transform)
        return;
      const [x, y, zoom] = state.transform;
      save(camera, { x, y, zoom });
    });
    const flush = () => {
      const camera = active.current;
      if (!camera) return;
      save(camera, camera.viewport);
      flushTreeViewport(camera.treeId, camera.compact);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unsubscribe();
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [store, save]);

  useLayoutEffect(() => {
    if (!initialized || !width || !height) return;
    const key = `${treeId}:${compact}`;
    const previous = active.current;
    const switching = previous?.key !== key;
    let camera = previous;
    let target: Viewport | undefined;
    let duration = 0;
    let handled: SkillFocusRequest | undefined;

    if (switching || !camera) {
      if (previous) {
        save(previous, flow.getViewport());
        flushTreeViewport(previous.treeId, previous.compact);
      }
      const saved = readTreeViewport(treeId, compact);
      target = saved
        ? restoreTreeViewport(saved, width, height)
        : getViewportForBounds(
            bounds,
            width,
            height,
            0.1,
            1,
            compact ? 0.18 : 0.16,
          );
      camera = {
        key,
        treeId,
        compact,
        width,
        height,
        viewport: target,
        automatic: !saved,
        handledFocus: null,
      };
      active.current = camera;
    } else if (camera.width !== width || camera.height !== height) {
      target = camera.automatic
        ? getViewportForBounds(
            bounds,
            width,
            height,
            0.1,
            1,
            compact ? 0.18 : 0.16,
          )
        : restoreTreeViewport(
            { ...camera.viewport, width: camera.width, height: camera.height },
            width,
            height,
          );
    } else if (camera.automatic) {
      target = getViewportForBounds(
        bounds,
        width,
        height,
        0.1,
        1,
        compact ? 0.18 : 0.16,
      );
    }
    camera.width = width;
    camera.height = height;

    if (requestedNode && focusRequest && camera.handledFocus !== requestKey) {
      const zoom = compact ? 0.9 : 1.2;
      target = {
        x:
          width / 2 -
          (requestedNode.position.x + (requestedNode.width ?? 170) / 2) * zoom,
        y:
          height / 2 -
          (requestedNode.position.y + (requestedNode.height ?? 150) / 2) * zoom,
        zoom,
      };
      camera.automatic = false;
      camera.handledFocus = requestKey;
      handled = focusRequest;
      duration = switching || reduced ? 0 : 320;
    }

    if (!target) return;
    const owner = camera;
    if (!duration) save(owner, target);
    // Tree changes restore directly behind the fade. They never animate through the origin.
    void flow.setViewport(target, { duration }).then((applied) => {
      if (
        applied &&
        handled &&
        active.current === owner &&
        owner.handledFocus === requestKey
      ) {
        onFocusHandled?.(handled);
      }
    });
  }, [
    initialized,
    width,
    height,
    treeId,
    compact,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    requestKey,
    requestedNode?.position.x,
    requestedNode?.position.y,
    requestedNode?.width,
    requestedNode?.height,
    reduced,
    onFocusHandled,
    flow,
    save,
  ]);

  const controlCamera = useCallback(() => {
    if (active.current) active.current.automatic = false;
  }, []);
  const fit = useCallback(() => {
    if (!initialized || !width || !height) return;
    controlCamera();
    const availableWidth = compact ? width : Math.max(360, width - 520);
    const viewport = getViewportForBounds(
      bounds,
      availableWidth,
      height,
      0.1,
      1,
      compact ? 0.18 : 0.16,
    );
    if (!compact) viewport.x -= 180;
    void flow.setViewport(viewport, {
      duration: reduced ? 0 : 320,
    });
  }, [
    initialized,
    width,
    height,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    compact,
    reduced,
    flow,
    controlCamera,
  ]);
  const centerOnNode = useCallback(
    (id: string, zoom: number) => {
      if (!initialized || !width || !height) return;
      const node = nodes.find((item) => item.id === id);
      if (!node) return;
      controlCamera();
      void flow.setViewport(
        {
          x: width / 2 - (node.position.x + (node.width ?? 170) / 2) * zoom,
          y: height / 2 - (node.position.y + (node.height ?? 150) / 2) * zoom,
          zoom,
        },
        { duration: reduced ? 0 : 320 },
      );
    },
    [initialized, width, height, nodes, controlCamera, reduced, flow],
  );
  return { controlCamera, fit, centerOnNode };
}
