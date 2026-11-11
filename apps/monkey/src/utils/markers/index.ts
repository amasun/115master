export {
  addMarker,
  buildSegments,
  createDoc,
  findNextMarker,
  findPrevMarker,
  formatMarkerTime,
  mergeDocs,
  nextSegmentAction,
  parseDocs,
  pruneTombstones,
  removeMarker,
  serializeDocs,
  updateMarker,
  visibleMarkers,
} from './core'

export type {
  AddMarkerInput,
  CreateDocMeta,
  Marker,
  MarkerDoc,
  MarkerExportData,
  MarkerPoint,
  MarkerSegment,
  SegmentAction,
  UpdateMarkerPatch,
} from './types'
