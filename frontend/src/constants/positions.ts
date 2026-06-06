/**
 * Position constants for office elements.
 *
 * All positions are in pixels relative to the canvas origin (top-left).
 */

// ============================================================================
// WALL DECORATIONS
// ============================================================================

// Topbar elements descidos +65px total (+40 inicial + 10 + 15) pra
// acompanhar a parede de 385px de altura.

/** Employee of the Month frame position */
export const EMPLOYEE_OF_MONTH_POSITION = { x: 184, y: 115 };

/** City window position */
export const CITY_WINDOW_POSITION = { x: 319, y: 95 };

/** Safety sign position */
export const SAFETY_SIGN_POSITION = { x: 1120, y: 105 };

/** Wall clock position */
export const WALL_CLOCK_POSITION = { x: 581, y: 145 };

/** Wall outlet position (below clock) */
export const WALL_OUTLET_POSITION = { x: 581, y: 274 };

/** Whiteboard position */
export const WHITEBOARD_POSITION = { x: 641, y: 76 };

/** Water cooler position */
export const WATER_COOLER_POSITION = { x: 1010, y: 265 };

/** Coffee machine position (to the right of water cooler) */
export const COFFEE_MACHINE_POSITION = { x: 1081, y: 256 };

// ============================================================================
// FLOOR ELEMENTS
// ============================================================================

/** Printer station position (bottom left corner) */
export const PRINTER_STATION_POSITION = { x: 50, y: 945 };

/** Plant position (to the right of printer) */
export const PLANT_POSITION = { x: 118, y: 970 };

/** Radio (boombox) position — diagonal mirror of the printer (bottom-right floor) */
export const RADIO_POSITION = { x: 1230, y: 945 };

// ============================================================================
// BOSS AREA
// ============================================================================

/** Boss area rug position (centered under boss desk) */
export const BOSS_RUG_POSITION = { x: 640, y: 940 };

/** Trash can offset from boss desk position */
export const TRASH_CAN_OFFSET = { x: 110, y: 65 };
