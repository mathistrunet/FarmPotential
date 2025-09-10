import MapboxDraw from "@mapbox/mapbox-gl-draw";

// Base simple_select mode from Mapbox Draw
const SimpleSelect = MapboxDraw.modes.simple_select;

// Minimal active feature check to avoid depending on internal utils
function isActiveFeature(e) {
  const featureTarget = e.featureTarget;
  if (!featureTarget || !featureTarget.properties) return false;
  return (
    featureTarget.properties.active === "true" &&
    featureTarget.properties.meta === "feature"
  );
}

// Custom simple_select mode enabling box selection with left mouse drag
const CustomSimpleSelect = { ...SimpleSelect };

// Start box selection on left mouse down (no shift required)
CustomSimpleSelect.onMouseDown = function (state, e) {
  state.initialDragPanState = this.map.dragPan.isEnabled();
  if (isActiveFeature(e)) return this.startOnActiveFeature(state, e);
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
