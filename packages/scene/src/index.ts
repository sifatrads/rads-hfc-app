/**
 * @rads/scene — the AnnotatedScene view model: build once from a ProjectModel
 * (+ optional calc results), then render with @rads/viewer-3d (WebGL) or
 * @rads/report (vector PDF). Pure data; no three.js, no DOM.
 */
export * from "./types";
export * from "./build";
export * from "./colorize";
export { nominalSizeToMm, formatterFor, type UnitFormatter } from "./units";
// re-export projection helpers so renderers import everything from @rads/scene
export { project, isoProject, planProject, frontProject, sideProject, bounds2, type ViewKind, type Point2, type Bounds2 } from "@rads/geometry";
