import SimpleSelect from "@mapbox/mapbox-gl-draw/src/modes/simple_select.js";
import * as CommonSelectors from "@mapbox/mapbox-gl-draw/src/lib/common_selectors.js";

// Custom simple_select mode enabling box selection with left mouse drag
const CustomSimpleSelect = { ...SimpleSelect };

// Start box selection on left mouse down (no shift required)
CustomSimpleSelect.onMouseDown = function (state, e) {
  state.initialDragPanState = this.map.dragPan.isEnabled();
  if (CommonSelectors.isActiveFeature(e)) return this.startOnActiveFeature(state, e);
  if (this.drawConfig.boxSelect && e.originalEvent && e.originalEvent.button === 0) {
    return this.startBoxSelect(state, e);
  }
};

// Ensure box select continues without needing shift key during drag
CustomSimpleSelect.onDrag = function (state, e) {
  if (state.canDragMove) return this.dragMove(state, e);
  if (this.drawConfig.boxSelect && state.canBoxSelect) return this.whileBoxSelect(state, e);
};

export default CustomSimpleSelect;
