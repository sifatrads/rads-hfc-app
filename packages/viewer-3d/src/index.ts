/**
 * @rads/viewer-3d — interactive 360° WebGL viewer (three.js + react-three-fiber)
 * for an AnnotatedScene. Reuses @rads/scene (colorize) + @rads/labeling overlay.
 */
export { Viewer, type ViewerProps } from "./Viewer";
export { computeTransform, toThree, pipeRadius, SCENE_SPAN, VIEW_POSITIONS, type SceneTransform } from "./transform";
