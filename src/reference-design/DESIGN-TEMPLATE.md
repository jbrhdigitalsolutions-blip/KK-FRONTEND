# DEISGN.md

> Complete Frontend Visual, Layout, Responsive, Interaction and Behaviour Specification.

## Objective

Using this file, a Coding Agent must be able to build, rebuild, migrate, or upgrade a frontend while reproducing the reference UI/UX as accurately as possible without guessing.

All measurable values must be extracted from the reference and replace the placeholders defined below.

---

# 1. Global Design System

## 1.1 Colors

1. Primary Color: `{{PRIMARY_COLOR}}`
2. Secondary Color: `{{SECONDARY_COLOR}}`
3. Accent Color: `{{ACCENT_COLOR}}`
4. Brand Colors: `{{BRAND_COLORS}}`
5. Background Color: `{{BACKGROUND_COLOR}}`
6. Surface Color: `{{SURFACE_COLOR}}`
7. Elevated Surface Color: `{{ELEVATED_SURFACE_COLOR}}`
8. Text Primary: `{{TEXT_PRIMARY}}`
9. Text Secondary: `{{TEXT_SECONDARY}}`
10. Text Muted: `{{TEXT_MUTED}}`
11. Border Color: `{{BORDER_COLOR}}`
12. Divider Color: `{{DIVIDER_COLOR}}`
13. Success Color: `{{SUCCESS_COLOR}}`
14. Warning Color: `{{WARNING_COLOR}}`
15. Error Color: `{{ERROR_COLOR}}`
16. Info Color: `{{INFO_COLOR}}`
17. Disabled Color: `{{DISABLED_COLOR}}`
18. Hover Color: `{{HOVER_COLOR}}`
19. Active Color: `{{ACTIVE_COLOR}}`
20. Focus Color: `{{FOCUS_COLOR}}`
21. Selection Color: `{{SELECTION_COLOR}}`
22. Overlay Color: `{{OVERLAY_COLOR}}`
23. Overlay Opacity: `{{OVERLAY_OPACITY}}`
24. Gradient Start: `{{GRADIENT_START}}`
25. Gradient End: `{{GRADIENT_END}}`
26. Gradient Angle: `{{GRADIENT_ANGLE_DEG}}deg`
27. Gradient Stops: `{{GRADIENT_STOPS}}`

---

# 2. Typography

1. Primary Font: `{{PRIMARY_FONT}}`
2. Secondary Font: `{{SECONDARY_FONT}}`
3. Monospace Font: `{{MONO_FONT}}`
4. Base Font Size: `{{BASE_FONT_SIZE_PX}}px`
5. Display Font Size: `{{DISPLAY_SIZE_PX}}px`
6. H1 Size: `{{H1_SIZE_PX}}px`
7. H2 Size: `{{H2_SIZE_PX}}px`
8. H3 Size: `{{H3_SIZE_PX}}px`
9. H4 Size: `{{H4_SIZE_PX}}px`
10. H5 Size: `{{H5_SIZE_PX}}px`
11. H6 Size: `{{H6_SIZE_PX}}px`
12. Body Large: `{{BODY_LARGE_PX}}px`
13. Body Regular: `{{BODY_REGULAR_PX}}px`
14. Body Small: `{{BODY_SMALL_PX}}px`
15. Caption Size: `{{CAPTION_SIZE_PX}}px`
16. Label Size: `{{LABEL_SIZE_PX}}px`
17. Font Weight Regular: `{{FONT_WEIGHT_REGULAR}}`
18. Font Weight Medium: `{{FONT_WEIGHT_MEDIUM}}`
19. Font Weight Semibold: `{{FONT_WEIGHT_SEMIBOLD}}`
20. Font Weight Bold: `{{FONT_WEIGHT_BOLD}}`
21. Heading Line Height: `{{HEADING_LINE_HEIGHT}}`
22. Body Line Height: `{{BODY_LINE_HEIGHT}}`
23. Letter Spacing: `{{LETTER_SPACING_PX}}px`
24. Heading Letter Spacing: `{{HEADING_LETTER_SPACING_PX}}px`
25. Maximum Text Width: `{{MAX_TEXT_WIDTH_CH}}ch`
26. Paragraph Gap: `{{PARAGRAPH_GAP_PX}}px`

---

# 3. Spacing System

1. Base Spacing Unit: `{{SPACE_BASE_PX}}px`
2. XS Spacing: `{{SPACE_XS_PX}}px`
3. SM Spacing: `{{SPACE_SM_PX}}px`
4. MD Spacing: `{{SPACE_MD_PX}}px`
5. LG Spacing: `{{SPACE_LG_PX}}px`
6. XL Spacing: `{{SPACE_XL_PX}}px`
7. XXL Spacing: `{{SPACE_XXL_PX}}px`
8. Section Gap Desktop: `{{SECTION_GAP_DESKTOP_PX}}px`
9. Section Gap Tablet: `{{SECTION_GAP_TABLET_PX}}px`
10. Section Gap Mobile: `{{SECTION_GAP_MOBILE_PX}}px`
11. Card Padding: `{{CARD_PADDING_PX}}px`
12. Component Gap: `{{COMPONENT_GAP_PX}}px`
13. Grid Gap: `{{GRID_GAP_PX}}px`
14. Horizontal Page Padding Desktop: `{{PAGE_PADDING_DESKTOP_PX}}px`
15. Horizontal Page Padding Tablet: `{{PAGE_PADDING_TABLET_PX}}px`
16. Horizontal Page Padding Mobile: `{{PAGE_PADDING_MOBILE_PX}}px`

---

# 4. Layout System

1. Maximum Content Width: `{{MAX_CONTENT_WIDTH_PX}}px`
2. Minimum Content Width: `{{MIN_CONTENT_WIDTH_PX}}px`
3. Main Container Width: `{{CONTAINER_WIDTH}}`
4. Grid Columns Desktop: `{{GRID_COLUMNS_DESKTOP}}`
5. Grid Columns Tablet: `{{GRID_COLUMNS_TABLET}}`
6. Grid Columns Mobile: `{{GRID_COLUMNS_MOBILE}}`
7. Grid Column Gap: `{{GRID_COLUMN_GAP_PX}}px`
8. Grid Row Gap: `{{GRID_ROW_GAP_PX}}px`
9. Sidebar Width Expanded: `{{SIDEBAR_EXPANDED_PX}}px`
10. Sidebar Width Collapsed: `{{SIDEBAR_COLLAPSED_PX}}px`
11. Header Height: `{{HEADER_HEIGHT_PX}}px`
12. Footer Height: `{{FOOTER_HEIGHT_PX}}px`
13. Content Offset: `{{CONTENT_OFFSET_PX}}px`
14. Hero Minimum Height: `{{HERO_MIN_HEIGHT}}`
15. Section Minimum Height: `{{SECTION_MIN_HEIGHT}}`
16. Card Minimum Width: `{{CARD_MIN_WIDTH_PX}}px`
17. Card Maximum Width: `{{CARD_MAX_WIDTH_PX}}px`
18. Layout Aspect Ratio: `{{LAYOUT_ASPECT_RATIO}}`

---

# 5. Responsive Breakpoints

1. Extra Small: `{{BREAKPOINT_XS_PX}}px`
2. Small: `{{BREAKPOINT_SM_PX}}px`
3. Medium: `{{BREAKPOINT_MD_PX}}px`
4. Large: `{{BREAKPOINT_LG_PX}}px`
5. Extra Large: `{{BREAKPOINT_XL_PX}}px`
6. Ultra Wide: `{{BREAKPOINT_XXL_PX}}px`

## Responsive Formula

```text
Fluid Value =
clamp(
  {{MIN_VALUE}},
  calc({{BASE_VALUE}} + {{VIEWPORT_FACTOR}}vw),
  {{MAX_VALUE}}
)

```

## Responsive Behaviour

- Desktop: `{{DESKTOP_LAYOUT_RULES}}`
- Laptop: `{{LAPTOP_LAYOUT_RULES}}`
- Tablet: `{{TABLET_LAYOUT_RULES}}`
- Mobile: `{{MOBILE_LAYOUT_RULES}}`
- Small Mobile: `{{SMALL_MOBILE_LAYOUT_RULES}}`
- Ultrawide: `{{ULTRAWIDE_LAYOUT_RULES}}`

---

# 6. Borders and Geometry

1. Border Width: `{{BORDER_WIDTH_PX}}px`
2. Strong Border Width: `{{STRONG_BORDER_WIDTH_PX}}px`
3. Small Radius: `{{RADIUS_SM_PX}}px`
4. Medium Radius: `{{RADIUS_MD_PX}}px`
5. Large Radius: `{{RADIUS_LG_PX}}px`
6. XL Radius: `{{RADIUS_XL_PX}}px`
7. Pill Radius: `{{RADIUS_PILL}}`
8. Circle Radius: `50%`
9. Divider Thickness: `{{DIVIDER_WIDTH_PX}}px`

---

# 7. Shadows and Elevation

1. Shadow Small: `{{SHADOW_SM}}`
2. Shadow Medium: `{{SHADOW_MD}}`
3. Shadow Large: `{{SHADOW_LG}}`
4. Floating Shadow: `{{FLOATING_SHADOW}}`
5. Modal Shadow: `{{MODAL_SHADOW}}`
6. Hover Shadow: `{{HOVER_SHADOW}}`
7. Elevation Levels: `{{ELEVATION_LEVELS}}`
8. Blur Radius: `{{BLUR_RADIUS_PX}}px`
9. Backdrop Blur: `{{BACKDROP_BLUR_PX}}px`

---

# 8. Header

1. Height: `{{HEADER_HEIGHT_PX}}px`
2. Padding: `{{HEADER_PADDING_PX}}px`
3. Logo Width: `{{HEADER_LOGO_WIDTH_PX}}px`
4. Navigation Gap: `{{HEADER_NAV_GAP_PX}}px`
5. Sticky Position: `{{HEADER_STICKY_POSITION}}`
6. Background: `{{HEADER_BACKGROUND}}`
7. Border: `{{HEADER_BORDER}}`
8. Shadow: `{{HEADER_SHADOW}}`
9. Mobile Transformation: `{{HEADER_MOBILE_BEHAVIOUR}}`

---

# 9. Navigation

1. Navigation Type: `{{NAV_TYPE}}`
2. Item Height: `{{NAV_ITEM_HEIGHT_PX}}px`
3. Item Width: `{{NAV_ITEM_WIDTH}}`
4. Item Gap: `{{NAV_ITEM_GAP_PX}}px`
5. Icon Size: `{{NAV_ICON_SIZE_PX}}px`
6. Active Indicator Size: `{{NAV_ACTIVE_INDICATOR_SIZE}}`
7. Hover State: `{{NAV_HOVER_STATE}}`
8. Active State: `{{NAV_ACTIVE_STATE}}`
9. Mobile Navigation: `{{MOBILE_NAV_PATTERN}}`
10. Nested Navigation Behaviour: `{{NESTED_NAV_BEHAVIOUR}}`

---

# 10. Sidebar

1. Expanded Width: `{{SIDEBAR_EXPANDED_PX}}px`
2. Collapsed Width: `{{SIDEBAR_COLLAPSED_PX}}px`
3. Item Height: `{{SIDEBAR_ITEM_HEIGHT_PX}}px`
4. Item Gap: `{{SIDEBAR_ITEM_GAP_PX}}px`
5. Icon Size: `{{SIDEBAR_ICON_SIZE_PX}}px`
6. Collapse Animation: `{{SIDEBAR_ANIMATION_MS}}ms`
7. Mobile Behaviour: `{{SIDEBAR_MOBILE_BEHAVIOUR}}`
8. Overlay Behaviour: `{{SIDEBAR_OVERLAY_BEHAVIOUR}}`

---

# 11. Hero Sections

1. Hero Height: `{{HERO_HEIGHT}}`
2. Minimum Height: `{{HERO_MIN_HEIGHT_PX}}px`
3. Maximum Width: `{{HERO_MAX_WIDTH_PX}}px`
4. Text Width: `{{HERO_TEXT_WIDTH_PX}}px`
5. Content Alignment: `{{HERO_ALIGNMENT}}`
6. CTA Gap: `{{HERO_CTA_GAP_PX}}px`
7. Media Ratio: `{{HERO_MEDIA_RATIO}}`
8. Desktop Layout: `{{HERO_DESKTOP_LAYOUT}}`
9. Mobile Layout: `{{HERO_MOBILE_LAYOUT}}`
10. Entrance Animation: `{{HERO_ENTRANCE_ANIMATION}}`

---

# 12. Cards

1. Card Width: `{{CARD_WIDTH}}`
2. Card Height: `{{CARD_HEIGHT}}`
3. Minimum Height: `{{CARD_MIN_HEIGHT_PX}}px`
4. Padding: `{{CARD_PADDING_PX}}px`
5. Gap: `{{CARD_CONTENT_GAP_PX}}px`
6. Radius: `{{CARD_RADIUS_PX}}px`
7. Border: `{{CARD_BORDER}}`
8. Shadow: `{{CARD_SHADOW}}`
9. Hover Transform: `{{CARD_HOVER_TRANSFORM}}`
10. Hover Duration: `{{CARD_HOVER_DURATION_MS}}ms`
11. Mobile Layout: `{{CARD_MOBILE_LAYOUT}}`
12. Card Grid Columns: `{{CARD_GRID_COLUMNS}}`

---

# 13. Buttons

1. Button Height Small: `{{BUTTON_SM_HEIGHT_PX}}px`
2. Button Height Medium: `{{BUTTON_MD_HEIGHT_PX}}px`
3. Button Height Large: `{{BUTTON_LG_HEIGHT_PX}}px`
4. Horizontal Padding: `{{BUTTON_PADDING_X_PX}}px`
5. Vertical Padding: `{{BUTTON_PADDING_Y_PX}}px`
6. Radius: `{{BUTTON_RADIUS_PX}}px`
7. Icon Size: `{{BUTTON_ICON_SIZE_PX}}px`
8. Icon Gap: `{{BUTTON_ICON_GAP_PX}}px`
9. Hover Scale: `{{BUTTON_HOVER_SCALE}}`
10. Press Scale: `{{BUTTON_PRESS_SCALE}}`
11. Transition Duration: `{{BUTTON_TRANSITION_MS}}ms`
12. Primary Style: `{{BUTTON_PRIMARY_STYLE}}`
13. Secondary Style: `{{BUTTON_SECONDARY_STYLE}}`
14. Ghost Style: `{{BUTTON_GHOST_STYLE}}`
15. Disabled Style: `{{BUTTON_DISABLED_STYLE}}`

---

# 14. Forms

1. Input Height: `{{INPUT_HEIGHT_PX}}px`
2. Textarea Minimum Height: `{{TEXTAREA_MIN_HEIGHT_PX}}px`
3. Input Padding X: `{{INPUT_PADDING_X_PX}}px`
4. Input Padding Y: `{{INPUT_PADDING_Y_PX}}px`
5. Input Radius: `{{INPUT_RADIUS_PX}}px`
6. Label Gap: `{{LABEL_INPUT_GAP_PX}}px`
7. Field Gap: `{{FIELD_GAP_PX}}px`
8. Focus Border: `{{INPUT_FOCUS_BORDER}}`
9. Focus Ring Width: `{{FOCUS_RING_WIDTH_PX}}px`
10. Error Border: `{{INPUT_ERROR_BORDER}}`
11. Success Border: `{{INPUT_SUCCESS_BORDER}}`
12. Validation Timing: `{{VALIDATION_TIMING}}`
13. Mobile Keyboard Behaviour: `{{MOBILE_KEYBOARD_BEHAVIOUR}}`
14. Autofocus Behaviour: `{{AUTOFOCUS_BEHAVIOUR}}`

---

# 15. Tables and Data Grids

1. Row Height: `{{TABLE_ROW_HEIGHT_PX}}px`
2. Header Height: `{{TABLE_HEADER_HEIGHT_PX}}px`
3. Cell Padding: `{{TABLE_CELL_PADDING_PX}}px`
4. Column Gap: `{{TABLE_COLUMN_GAP_PX}}px`
5. Border Style: `{{TABLE_BORDER}}`
6. Sticky Header: `{{TABLE_STICKY_HEADER}}`
7. Mobile Transformation: `{{TABLE_MOBILE_TRANSFORMATION}}`
8. Horizontal Overflow: `{{TABLE_OVERFLOW_RULE}}`
9. Pagination Size: `{{PAGINATION_ITEM_SIZE_PX}}px`

---

# 16. Icons and SVG

1. Icon Library: `{{ICON_LIBRARY}}`
2. Small Icon: `{{ICON_SM_PX}}px`
3. Medium Icon: `{{ICON_MD_PX}}px`
4. Large Icon: `{{ICON_LG_PX}}px`
5. Stroke Width: `{{ICON_STROKE_WIDTH}}`
6. Default Color: `{{ICON_COLOR}}`
7. Active Color: `{{ICON_ACTIVE_COLOR}}`
8. SVG ViewBox: `{{SVG_VIEWBOX}}`
9. SVG Scaling Rule: `{{SVG_SCALING_RULE}}`
10. SVG Animation: `{{SVG_ANIMATION_RULES}}`

---

# 17. Images and Media

1. Default Aspect Ratio: `{{IMAGE_ASPECT_RATIO}}`
2. Hero Image Ratio: `{{HERO_IMAGE_RATIO}}`
3. Thumbnail Ratio: `{{THUMBNAIL_RATIO}}`
4. Object Fit: `{{IMAGE_OBJECT_FIT}}`
5. Object Position: `{{IMAGE_OBJECT_POSITION}}`
6. Border Radius: `{{IMAGE_RADIUS_PX}}px`
7. Loading Strategy: `{{IMAGE_LOADING_STRATEGY}}`
8. Responsive `srcset`: `{{RESPONSIVE_IMAGE_RULES}}`
9. Video Aspect Ratio: `{{VIDEO_ASPECT_RATIO}}`
10. Video Behaviour: `{{VIDEO_BEHAVIOUR}}`

---

# 18. Modals, Dialogs and Drawers

1. Modal Width: `{{MODAL_WIDTH_PX}}px`
2. Modal Maximum Width: `{{MODAL_MAX_WIDTH_PX}}px`
3. Modal Padding: `{{MODAL_PADDING_PX}}px`
4. Modal Radius: `{{MODAL_RADIUS_PX}}px`
5. Overlay Opacity: `{{MODAL_OVERLAY_OPACITY}}`
6. Entrance Duration: `{{MODAL_ENTER_MS}}ms`
7. Exit Duration: `{{MODAL_EXIT_MS}}ms`
8. Drawer Width: `{{DRAWER_WIDTH_PX}}px`
9. Bottom Sheet Height: `{{BOTTOM_SHEET_HEIGHT}}`
10. Mobile Transformation: `{{MODAL_MOBILE_TRANSFORMATION}}`

---

# 19. Dropdowns, Popovers and Tooltips

1. Dropdown Minimum Width: `{{DROPDOWN_MIN_WIDTH_PX}}px`
2. Dropdown Maximum Height: `{{DROPDOWN_MAX_HEIGHT_PX}}px`
3. Dropdown Padding: `{{DROPDOWN_PADDING_PX}}px`
4. Popover Offset: `{{POPOVER_OFFSET_PX}}px`
5. Tooltip Offset: `{{TOOLTIP_OFFSET_PX}}px`
6. Tooltip Delay: `{{TOOLTIP_DELAY_MS}}ms`
7. Tooltip Maximum Width: `{{TOOLTIP_MAX_WIDTH_PX}}px`
8. Layer Z-Index: `{{POPOVER_Z_INDEX}}`

---

# 20. Tabs and Accordions

1. Tab Height: `{{TAB_HEIGHT_PX}}px`
2. Tab Gap: `{{TAB_GAP_PX}}px`
3. Active Indicator Width: `{{TAB_INDICATOR_WIDTH}}`
4. Indicator Height: `{{TAB_INDICATOR_HEIGHT_PX}}px`
5. Accordion Header Height: `{{ACCORDION_HEADER_HEIGHT_PX}}px`
6. Accordion Content Padding: `{{ACCORDION_CONTENT_PADDING_PX}}px`
7. Expand Duration: `{{ACCORDION_EXPAND_MS}}ms`
8. Collapse Duration: `{{ACCORDION_COLLAPSE_MS}}ms`

---

# 21. Badges, Chips and Status

1. Badge Height: `{{BADGE_HEIGHT_PX}}px`
2. Badge Padding: `{{BADGE_PADDING_PX}}px`
3. Chip Height: `{{CHIP_HEIGHT_PX}}px`
4. Status Dot Size: `{{STATUS_DOT_SIZE_PX}}px`
5. Avatar Small: `{{AVATAR_SM_PX}}px`
6. Avatar Medium: `{{AVATAR_MD_PX}}px`
7. Avatar Large: `{{AVATAR_LG_PX}}px`

---

# 22. Animations

1. Fast Duration: `{{ANIMATION_FAST_MS}}ms`
2. Normal Duration: `{{ANIMATION_NORMAL_MS}}ms`
3. Slow Duration: `{{ANIMATION_SLOW_MS}}ms`
4. Default Easing: `{{DEFAULT_EASING}}`
5. Entrance Easing: `{{ENTER_EASING}}`
6. Exit Easing: `{{EXIT_EASING}}`
7. Hover Duration: `{{HOVER_DURATION_MS}}ms`
8. Press Duration: `{{PRESS_DURATION_MS}}ms`
9. Page Transition: `{{PAGE_TRANSITION_MS}}ms`
10. Route Transition: `{{ROUTE_TRANSITION_MS}}ms`
11. Scroll Animation Duration: `{{SCROLL_ANIMATION_MS}}ms`
12. Stagger Delay: `{{STAGGER_DELAY_MS}}ms`
13. Parallax Factor: `{{PARALLAX_FACTOR}}`
14. Reveal Threshold: `{{REVEAL_THRESHOLD_PERCENT}}%`

---

# 23. Micro-Interactions

1. Hover Feedback: `{{HOVER_FEEDBACK}}`
2. Press Feedback: `{{PRESS_FEEDBACK}}`
3. Touch Feedback: `{{TOUCH_FEEDBACK}}`
4. Cursor Feedback: `{{CURSOR_FEEDBACK}}`
5. Drag Feedback: `{{DRAG_FEEDBACK}}`
6. Drop Feedback: `{{DROP_FEEDBACK}}`
7. Selection Feedback: `{{SELECTION_FEEDBACK}}`
8. Success Feedback: `{{SUCCESS_FEEDBACK}}`
9. Error Feedback: `{{ERROR_FEEDBACK}}`
10. Loading Feedback: `{{LOADING_FEEDBACK}}`

---

# 24. Cursor and Pointer Behaviour

1. Default Cursor: `{{CURSOR_DEFAULT}}`
2. Interactive Cursor: `{{CURSOR_INTERACTIVE}}`
3. Drag Cursor: `{{CURSOR_DRAG}}`
4. Disabled Cursor: `{{CURSOR_DISABLED}}`
5. Resize Cursor: `{{CURSOR_RESIZE}}`
6. Custom Cursor Size: `{{CUSTOM_CURSOR_SIZE_PX}}px`
7. Cursor Animation: `{{CURSOR_ANIMATION}}`

---

# 25. Touch and Gestures

1. Minimum Touch Target: `{{MIN_TOUCH_TARGET_PX}}px`
2. Tap Feedback Duration: `{{TAP_FEEDBACK_MS}}ms`
3. Long Press Threshold: `{{LONG_PRESS_MS}}ms`
4. Swipe Threshold: `{{SWIPE_THRESHOLD_PX}}px`
5. Swipe Velocity: `{{SWIPE_VELOCITY_THRESHOLD}}`
6. Drag Threshold: `{{DRAG_THRESHOLD_PX}}px`
7. Pinch Behaviour: `{{PINCH_BEHAVIOUR}}`
8. Touch Scrolling: `{{TOUCH_SCROLL_BEHAVIOUR}}`

---

# 26. Component States

Every interactive component must define:

1. Default
2. Hover
3. Active
4. Pressed
5. Focus
6. Focus Visible
7. Selected
8. Checked
9. Expanded
10. Collapsed
11. Disabled
12. Read Only
13. Loading
14. Submitting
15. Success
16. Warning
17. Error
18. Validation
19. Empty
20. Offline
21. Unavailable
22. Skeleton
23. Placeholder

State transition duration:

`{{STATE_TRANSITION_MS}}ms`

---

# 27. Scrolling

1. Scroll Behaviour: `{{SCROLL_BEHAVIOUR}}`
2. Scrollbar Width: `{{SCROLLBAR_WIDTH_PX}}px`
3. Scrollbar Radius: `{{SCROLLBAR_RADIUS_PX}}px`
4. Horizontal Scroll Behaviour: `{{HORIZONTAL_SCROLL_RULE}}`
5. Scroll Snap: `{{SCROLL_SNAP_RULE}}`
6. Sticky Offset: `{{STICKY_OFFSET_PX}}px`
7. Scroll Restoration: `{{SCROLL_RESTORATION_RULE}}`
8. Scroll Reveal Threshold: `{{SCROLL_REVEAL_THRESHOLD}}`

---

# 28. Z-Index System

```text
Base Content:      {{Z_BASE}}
Raised Content:    {{Z_RAISED}}
Sticky:            {{Z_STICKY}}
Header:            {{Z_HEADER}}
Dropdown:          {{Z_DROPDOWN}}
Popover:           {{Z_POPOVER}}
Drawer:            {{Z_DRAWER}}
Overlay:           {{Z_OVERLAY}}
Modal:             {{Z_MODAL}}
Toast:             {{Z_TOAST}}
Maximum Layer:     {{Z_MAX}}

```

---

# 29. Loading States

1. Initial Page Loading: `{{INITIAL_LOADING_UI}}`
2. Route Loading: `{{ROUTE_LOADING_UI}}`
3. Component Loading: `{{COMPONENT_LOADING_UI}}`
4. Data Loading: `{{DATA_LOADING_UI}}`
5. Button Loading: `{{BUTTON_LOADING_UI}}`
6. Skeleton Animation: `{{SKELETON_ANIMATION}}`
7. Skeleton Duration: `{{SKELETON_DURATION_MS}}ms`
8. Progressive Loading: `{{PROGRESSIVE_LOADING_RULE}}`

---

# 30. Error and Recovery States

1. Form Error: `{{FORM_ERROR_UI}}`
2. API Error: `{{API_ERROR_UI}}`
3. Network Error: `{{NETWORK_ERROR_UI}}`
4. Offline State: `{{OFFLINE_UI}}`
5. Not Found State: `{{NOT_FOUND_UI}}`
6. Permission Error: `{{PERMISSION_ERROR_UI}}`
7. Retry Behaviour: `{{RETRY_BEHAVIOUR}}`
8. Recovery Action: `{{RECOVERY_ACTION}}`

---

# 31. Empty States

1. Empty Page: `{{EMPTY_PAGE_UI}}`
2. Empty Search: `{{EMPTY_SEARCH_UI}}`
3. Empty Table: `{{EMPTY_TABLE_UI}}`
4. Empty List: `{{EMPTY_LIST_UI}}`
5. Empty Dashboard: `{{EMPTY_DASHBOARD_UI}}`
6. First-Time User State: `{{FIRST_TIME_USER_UI}}`

---

# 32. Navigation Behaviour

1. Routing Model: `{{ROUTING_MODEL}}`
2. Active Route Behaviour: `{{ACTIVE_ROUTE_BEHAVIOUR}}`
3. Nested Route Behaviour: `{{NESTED_ROUTE_BEHAVIOUR}}`
4. Deep Link Behaviour: `{{DEEP_LINK_BEHAVIOUR}}`
5. Browser Back Behaviour: `{{BACK_NAV_BEHAVIOUR}}`
6. Browser Forward Behaviour: `{{FORWARD_NAV_BEHAVIOUR}}`
7. Anchor Behaviour: `{{ANCHOR_BEHAVIOUR}}`
8. Route Transition: `{{ROUTE_TRANSITION}}`

---

# 33. Responsive Transformations

Define exact transformations for:

1. Desktop → Laptop: `{{DESKTOP_TO_LAPTOP}}`
2. Laptop → Tablet: `{{LAPTOP_TO_TABLET}}`
3. Tablet → Mobile: `{{TABLET_TO_MOBILE}}`
4. Multi-Column → Single Column: `{{MULTICOLUMN_TO_SINGLE}}`
5. Sidebar → Drawer: `{{SIDEBAR_TO_DRAWER}}`
6. Desktop Navigation → Mobile Navigation: `{{NAV_TO_MOBILE}}`
7. Table → Mobile View: `{{TABLE_TO_MOBILE}}`
8. Modal → Bottom Sheet: `{{MODAL_TO_SHEET}}`
9. Hover Interaction → Touch Interaction: `{{HOVER_TO_TOUCH}}`
10. Dense UI → Mobile Compact UI: `{{DENSITY_TRANSFORMATION}}`

---

# 34. Accessibility

1. Minimum Contrast Ratio Normal Text: `{{NORMAL_TEXT_CONTRAST_RATIO}}`
2. Minimum Contrast Ratio Large Text: `{{LARGE_TEXT_CONTRAST_RATIO}}`
3. Minimum Touch Target: `{{MIN_TOUCH_TARGET_PX}}px`
4. Keyboard Tab Order: `{{TAB_ORDER_RULES}}`
5. Focus Indicator: `{{FOCUS_INDICATOR}}`
6. ARIA Rules: `{{ARIA_RULES}}`
7. Screen Reader Behaviour: `{{SCREEN_READER_RULES}}`
8. Reduced Motion Behaviour: `{{REDUCED_MOTION_RULES}}`
9. Text Scaling Limit: `{{TEXT_SCALING_SUPPORT}}`
10. Accessible Error Behaviour: `{{ACCESSIBLE_ERROR_RULES}}`

---

# 35. Performance

1. Target LCP: `{{TARGET_LCP_MS}}ms`
2. Target INP: `{{TARGET_INP_MS}}ms`
3. Target CLS: `{{TARGET_CLS}}`
4. Initial JS Budget: `{{INITIAL_JS_BUDGET_KB}}KB`
5. Initial CSS Budget: `{{INITIAL_CSS_BUDGET_KB}}KB`
6. Image Budget: `{{IMAGE_BUDGET_KB}}KB`
7. Lazy Loading Threshold: `{{LAZY_LOADING_THRESHOLD_PX}}px`
8. Prefetch Strategy: `{{PREFETCH_STRATEGY}}`
9. Code Splitting Strategy: `{{CODE_SPLITTING_STRATEGY}}`
10. Virtualisation Threshold: `{{VIRTUALIZATION_ITEM_COUNT}}`

---

# 36. Layout Stability

1. Reserved Image Dimensions: `{{IMAGE_RESERVED_DIMENSIONS}}`
2. Reserved Video Dimensions: `{{VIDEO_RESERVED_DIMENSIONS}}`
3. Skeleton Dimensions: `{{SKELETON_DIMENSIONS}}`
4. Font Fallback Metrics: `{{FONT_FALLBACK_METRICS}}`
5. Dynamic Content Reserved Height: `{{DYNAMIC_CONTENT_RESERVED_HEIGHT}}`
6. Maximum Allowed Layout Shift: `{{MAX_LAYOUT_SHIFT}}`

---

# 37. Themes

## Light Theme

`{{LIGHT_THEME_SPEC}}`

## Dark Theme

`{{DARK_THEME_SPEC}}`

## System Theme

`{{SYSTEM_THEME_BEHAVIOUR}}`

## Theme Transition

Duration: `{{THEME_TRANSITION_MS}}ms`

Behaviour: `{{THEME_TRANSITION_BEHAVIOUR}}`

---

# 38. Content Behaviour

1. Long Heading Handling: `{{LONG_HEADING_RULE}}`
2. Long Paragraph Handling: `{{LONG_PARAGRAPH_RULE}}`
3. Long Label Handling: `{{LONG_LABEL_RULE}}`
4. Number Formatting: `{{NUMBER_FORMAT}}`
5. Currency Formatting: `{{CURRENCY_FORMAT}}`
6. Date Formatting: `{{DATE_FORMAT}}`
7. Time Formatting: `{{TIME_FORMAT}}`
8. Timestamp Formatting: `{{TIMESTAMP_FORMAT}}`
9. Truncation Limit: `{{TRUNCATION_CHARACTERS}}`
10. Maximum Lines: `{{MAX_TEXT_LINES}}`

---

# 39. Localization

1. Default Locale: `{{DEFAULT_LOCALE}}`
2. Supported Locales: `{{SUPPORTED_LOCALES}}`
3. RTL Support: `{{RTL_SUPPORT}}`
4. Long Translation Expansion Allowance: `{{TEXT_EXPANSION_PERCENT}}%`
5. Locale Number Format: `{{LOCALE_NUMBER_FORMAT}}`
6. Locale Currency Format: `{{LOCALE_CURRENCY_FORMAT}}`
7. Locale Date Format: `{{LOCALE_DATE_FORMAT}}`

---

# 40. Browser and Device Coverage

1. Chrome: `{{CHROME_SUPPORT}}`
2. Edge: `{{EDGE_SUPPORT}}`
3. Safari: `{{SAFARI_SUPPORT}}`
4. Firefox: `{{FIREFOX_SUPPORT}}`
5. iOS Safari: `{{IOS_SAFARI_SUPPORT}}`
6. Android Chrome: `{{ANDROID_CHROME_SUPPORT}}`
7. Minimum Viewport Width: `{{MIN_VIEWPORT_WIDTH_PX}}px`
8. Maximum Tested Width: `{{MAX_VIEWPORT_WIDTH_PX}}px`
9. High-DPI Behaviour: `{{HIGH_DPI_RULES}}`
10. Orientation Behaviour: `{{ORIENTATION_RULES}}`

---

# 41. Page Types

The design reference must define patterns for:

1. Landing Pages
2. Dashboard Pages
3. Detail Pages
4. List Pages
5. Search Pages
6. Settings Pages
7. Profile Pages
8. Account Pages
9. Authentication Pages
10. Signup Pages
11. Login Pages
12. Password Recovery Pages
13. Onboarding Pages
14. Setup Pages
15. Billing Pages
16. Subscription Pages
17. Help Pages
18. Support Pages
19. Error Pages
20. Empty Pages

Page-specific specification:

`{{PAGE_TYPE_RULES}}`

---

# 42. Interaction Flows

Define UI behaviour for:

1. Create
2. Read
3. Edit
4. Update
5. Delete
6. Search
7. Filter
8. Sort
9. Select
10. Multi-Select
11. Upload
12. Download
13. Submit
14. Cancel
15. Confirm
16. Undo
17. Retry
18. Navigate
19. Expand
20. Collapse
21. Drag
22. Drop

Interaction timing:

`{{INTERACTION_RESPONSE_TARGET_MS}}ms`

---

# 43. Feedback System

1. Success Feedback: `{{SUCCESS_FEEDBACK_SPEC}}`
2. Warning Feedback: `{{WARNING_FEEDBACK_SPEC}}`
3. Error Feedback: `{{ERROR_FEEDBACK_SPEC}}`
4. Info Feedback: `{{INFO_FEEDBACK_SPEC}}`
5. Progress Feedback: `{{PROGRESS_FEEDBACK_SPEC}}`
6. Save Feedback: `{{SAVE_FEEDBACK_SPEC}}`
7. Delete Feedback: `{{DELETE_FEEDBACK_SPEC}}`
8. Network Feedback: `{{NETWORK_FEEDBACK_SPEC}}`

---

# 44. Visual Hierarchy

1. Primary Attention Area: `{{PRIMARY_ATTENTION_AREA}}`
2. Secondary Attention Area: `{{SECONDARY_ATTENTION_AREA}}`
3. Primary CTA: `{{PRIMARY_CTA_RULE}}`
4. Secondary CTA: `{{SECONDARY_CTA_RULE}}`
5. Tertiary Action: `{{TERTIARY_ACTION_RULE}}`
6. Contrast Hierarchy: `{{CONTRAST_HIERARCHY}}`
7. Content Priority: `{{CONTENT_PRIORITY_RULE}}`
8. Visual Weight Distribution: `{{VISUAL_WEIGHT_DISTRIBUTION}}`

---

# 45. Design Consistency

The implementation must maintain:

1. Color Consistency
2. Typography Consistency
3. Spacing Consistency
4. Alignment Consistency
5. Icon Consistency
6. Radius Consistency
7. Shadow Consistency
8. Interaction Consistency
9. Motion Consistency
10. Responsive Consistency
11. Component Consistency
12. Cross-Page Consistency

Allowed deviation:

`{{MAX_VISUAL_DEVIATION}}`

---

# 46. Component Architecture

1. Design Tokens: `{{DESIGN_TOKEN_STRUCTURE}}`
2. CSS Variables: `{{CSS_VARIABLE_STRUCTURE}}`
3. Shared Components: `{{SHARED_COMPONENT_STRUCTURE}}`
4. Layout Components: `{{LAYOUT_COMPONENT_STRUCTURE}}`
5. Page Components: `{{PAGE_COMPONENT_STRUCTURE}}`
6. Feature Components: `{{FEATURE_COMPONENT_STRUCTURE}}`
7. Component Variants: `{{COMPONENT_VARIANTS}}`
8. Component Naming Convention: `{{COMPONENT_NAMING}}`
9. Component Folder Structure: `{{COMPONENT_FOLDER_STRUCTURE}}`

---

# 47. Asset Organisation

1. Logo Path: `{{LOGO_PATH}}`
2. Icon Path: `{{ICON_PATH}}`
3. SVG Path: `{{SVG_PATH}}`
4. Image Path: `{{IMAGE_PATH}}`
5. Video Path: `{{VIDEO_PATH}}`
6. Animation Path: `{{ANIMATION_PATH}}`
7. Font Path: `{{FONT_PATH}}`
8. Asset Naming Convention: `{{ASSET_NAMING_RULE}}`

---

# 48. Design Measurements

For every visible element record:

```text
Element:
{{ELEMENT_NAME}}

Width:
{{WIDTH_PX}}px

Height:
{{HEIGHT_PX}}px

X Position:
{{X_PX}}px

Y Position:
{{Y_PX}}px

Margin:
{{MARGIN_TOP}}px {{MARGIN_RIGHT}}px {{MARGIN_BOTTOM}}px {{MARGIN_LEFT}}px

Padding:
{{PADDING_TOP}}px {{PADDING_RIGHT}}px {{PADDING_BOTTOM}}px {{PADDING_LEFT}}px

Gap:
{{GAP_PX}}px

Border:
{{BORDER_WIDTH_PX}}px {{BORDER_STYLE}} {{BORDER_COLOR}}

Radius:
{{RADIUS_PX}}px

Font Size:
{{FONT_SIZE_PX}}px

Line Height:
{{LINE_HEIGHT_PX}}px

Letter Spacing:
{{LETTER_SPACING_PX}}px

Opacity:
{{OPACITY}}

Z-Index:
{{Z_INDEX}}

```

---

# 49. Proportional Calculations

## Width Ratio

```text
Element Width Ratio =
{{ELEMENT_WIDTH_PX}} / {{CONTAINER_WIDTH_PX}}
= {{WIDTH_RATIO}}

```

## Height Ratio

```text
Element Height Ratio =
{{ELEMENT_HEIGHT_PX}} / {{VIEWPORT_HEIGHT_PX}}
= {{HEIGHT_RATIO}}

```

## Horizontal Position

```text
X Percentage =
({{ELEMENT_X_PX}} / {{VIEWPORT_WIDTH_PX}}) × 100
= {{X_PERCENT}}%

```

## Vertical Position

```text
Y Percentage =
({{ELEMENT_Y_PX}} / {{VIEWPORT_HEIGHT_PX}}) × 100
= {{Y_PERCENT}}%

```

## Grid Column Width

```text
Column Width =
(
  {{CONTAINER_WIDTH_PX}}
  - ({{COLUMN_COUNT}} - 1 × {{COLUMN_GAP_PX}})
)
/
{{COLUMN_COUNT}}

= {{COLUMN_WIDTH_PX}}px

```

## Responsive Scale

```text
Scale Factor =
{{CURRENT_VIEWPORT_WIDTH}}
/
{{REFERENCE_VIEWPORT_WIDTH}}

= {{SCALE_FACTOR}}

```

---

# 50. Animation Calculations

## Travel Distance

```text
Distance =
{{END_POSITION_PX}} - {{START_POSITION_PX}}
= {{TRAVEL_DISTANCE_PX}}px

```

## Animation Velocity

```text
Velocity =
{{TRAVEL_DISTANCE_PX}}
/
{{ANIMATION_DURATION_MS}}

= {{ANIMATION_VELOCITY}}

```

## Stagger Duration

```text
Total Stagger =
({{ITEM_COUNT}} - 1)
×
{{STAGGER_DELAY_MS}}

= {{TOTAL_STAGGER_MS}}ms

```

---

# 51. Responsive Calculation Template

For each component:

```text
Reference Width:
{{REFERENCE_VIEWPORT_PX}}px

Component Width:
{{REFERENCE_COMPONENT_WIDTH_PX}}px

Width Percentage:
({{REFERENCE_COMPONENT_WIDTH_PX}} / {{REFERENCE_VIEWPORT_PX}}) × 100
= {{COMPONENT_WIDTH_PERCENT}}%

Minimum Width:
{{MIN_COMPONENT_WIDTH_PX}}px

Maximum Width:
{{MAX_COMPONENT_WIDTH_PX}}px

Final Rule:
clamp(
  {{MIN_COMPONENT_WIDTH_PX}}px,
  {{COMPONENT_WIDTH_PERCENT}}vw,
  {{MAX_COMPONENT_WIDTH_PX}}px
)

```

---

# 52. Interaction Measurement Template

For every interactive element:

```text
Element:
{{ELEMENT_NAME}}

Default:
{{DEFAULT_STATE}}

Hover:
{{HOVER_STATE}}

Pressed:
{{PRESSED_STATE}}

Focus:
{{FOCUS_STATE}}

Disabled:
{{DISABLED_STATE}}

Touch:
{{TOUCH_STATE}}

Cursor:
{{CURSOR_TYPE}}

Transition:
{{TRANSITION_PROPERTY}}

Duration:
{{TRANSITION_MS}}ms

Easing:
{{TRANSITION_EASING}}

Transform:
{{TRANSFORM_VALUE}}

```

---

# 53. Responsive Component Matrix

| ComponentDesktopTabletMobileCalculation |                       |                      |                      |                    |
| --------------------------------------- | --------------------- | -------------------- | -------------------- | ------------------ |
| Header                                  | `{{HEADER_DESKTOP}}`  | `{{HEADER_TABLET}}`  | `{{HEADER_MOBILE}}`  | `{{HEADER_CALC}}`  |
| Sidebar                                 | `{{SIDEBAR_DESKTOP}}` | `{{SIDEBAR_TABLET}}` | `{{SIDEBAR_MOBILE}}` | `{{SIDEBAR_CALC}}` |
| Hero                                    | `{{HERO_DESKTOP}}`    | `{{HERO_TABLET}}`    | `{{HERO_MOBILE}}`    | `{{HERO_CALC}}`    |
| Grid                                    | `{{GRID_DESKTOP}}`    | `{{GRID_TABLET}}`    | `{{GRID_MOBILE}}`    | `{{GRID_CALC}}`    |
| Card                                    | `{{CARD_DESKTOP}}`    | `{{CARD_TABLET}}`    | `{{CARD_MOBILE}}`    | `{{CARD_CALC}}`    |
| Navigation                              | `{{NAV_DESKTOP}}`     | `{{NAV_TABLET}}`     | `{{NAV_MOBILE}}`     | `{{NAV_CALC}}`     |
| Table                                   | `{{TABLE_DESKTOP}}`   | `{{TABLE_TABLET}}`   | `{{TABLE_MOBILE}}`   | `{{TABLE_CALC}}`   |
| Modal                                   | `{{MODAL_DESKTOP}}`   | `{{MODAL_TABLET}}`   | `{{MODAL_MOBILE}}`   | `{{MODAL_CALC}}`   |

---

# 54. Page Measurement Template

For every route/page:

```markdown
## Page: {{PAGE_NAME}}

Route:
{{PAGE_ROUTE}}

Reference Viewport:
{{REFERENCE_WIDTH_PX}} × {{REFERENCE_HEIGHT_PX}}

Content Width:
{{CONTENT_WIDTH_PX}}px

Page Padding:
{{PAGE_PADDING_PX}}px

Section Count:
{{SECTION_COUNT}}

Primary Layout:
{{PRIMARY_LAYOUT}}

Responsive Behaviour:
{{RESPONSIVE_BEHAVIOUR}}

Interactions:
{{PAGE_INTERACTIONS}}

Animations:
{{PAGE_ANIMATIONS}}

Special States:
{{PAGE_STATES}}

Mobile Transformation:
{{PAGE_MOBILE_TRANSFORMATION}}

```

---

# 55. Complete Frontend Coverage

The reference specification must capture:

1. Every visible frontend element.
2. Every interactive frontend element.
3. Every color.
4. Every gradient.
5. Every font.
6. Every typography rule.
7. Every spacing rule.
8. Every alignment.
9. Every dimension.
10. Every layout.
11. Every breakpoint.
12. Every responsive transformation.
13. Every component.
14. Every component variant.
15. Every component state.
16. Every icon.
17. Every SVG.
18. Every illustration.
19. Every image.
20. Every video.
21. Every chart.
22. Every table.
23. Every form.
24. Every navigation pattern.
25. Every modal.
26. Every drawer.
27. Every popup.
28. Every tooltip.
29. Every feedback state.
30. Every hover response.
31. Every cursor response.
32. Every touch response.
33. Every keyboard interaction.
34. Every gesture.
35. Every animation.
36. Every transition.
37. Every easing rule.
38. Every scroll behaviour.
39. Every loading state.
40. Every skeleton state.
41. Every error state.
42. Every empty state.
43. Every success state.
44. Every offline state.
45. Every accessibility behaviour.
46. Every theme.
47. Every page type.
48. Every route-specific variation.
49. Every device transformation.
50. Every visible or behavioural frontend detail required to reproduce the reference accurately.

---

# 56. Required Extraction Rule

Never guess a measurable design value when it can be derived from the reference.

Use:

```text
Measured Value:
{{MEASURED_VALUE}}

Source:
{{SOURCE}}

Calculation:
{{CALCULATION}}

Confidence:
{{CONFIDENCE_PERCENT}}%

Responsive Derivation:
{{RESPONSIVE_DERIVATION}}

```

If a value cannot be verified:

```text
UNKNOWN — DO NOT INVENT

Required Evidence:
{{REQUIRED_EVIDENCE}}

```

---

# 57. Final Success Criteria

The specification is complete only when a Coding Agent can use `DEISGN.md` to:

1. Reconstruct the visual system.
2. Reconstruct the component system.
3. Reconstruct the page layouts.
4. Reconstruct responsive behaviour.
5. Reconstruct interaction behaviour.
6. Reconstruct animations and transitions.
7. Reconstruct touch and cursor feedback.
8. Reconstruct component states.
9. Reconstruct light/dark themes.
10. Reconstruct navigation behaviour.
11. Reconstruct loading/error/empty states.
12. Reconstruct accessibility behaviour.
13. Reproduce Desktop, Tablet and Mobile layouts.
14. Reuse consistent design tokens and components.
15. Implement the frontend without needing to invent missing design decisions.

Final visual deviation target:

`{{TARGET_VISUAL_MATCH_PERCENT}}%`

Target responsive coverage:

`{{TARGET_RESPONSIVE_COVERAGE_PERCENT}}%`

Target component coverage:

`{{TARGET_COMPONENT_COVERAGE_PERCENT}}%`

Target interaction coverage:

`{{TARGET_INTERACTION_COVERAGE_PERCENT}}%`

Target frontend reproduction confidence:

`{{TARGET_CONFIDENCE_PERCENT}}%`