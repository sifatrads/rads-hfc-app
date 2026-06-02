/**
 * @rads/dxf-import — import an AutoCAD/Canute DXF into a calc-ready ProjectModel.
 *
 *   parseDxf(text) → analyzeDxf(doc) → defaultMapping(analysis) → importNetwork(doc, mapping)
 *
 * `analyzeDxf` lists every layer + a guessed role so the import UI can present a
 * fully selectable mapping; `importNetwork` builds the network with true 3D
 * geometry (node.geometry) read straight from the drawing.
 */
export * from "./parse";
export * from "./analyze";
export * from "./mapping";
export * from "./import";
