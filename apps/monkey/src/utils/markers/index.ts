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

export {
  decodeMarkersFromDesc,
  encodeMarkersIntoDesc,
  MARKER_DESC_END,
  MARKER_DESC_START,
  MAX_FILE_DESC_LENGTH,
  pushMarkersToFileDesc,
  syncMarkersFromFileDesc,
} from './descCodec'

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
