# Objective

Build a production-ready **Frontend Reference Intelligence & Upgrade System** with a local WebApp interface that runs on both **Windows and macOS**.

The system must allow the user to provide:

- A **Reference Website URL** whose UI/UX is used as the design reference.
- A **Target Project**, supplied through:
  - GitHub repository URL, including private repositories through explicit GitHub authorization,
  - live website URL,
  - or locally running website URL.

The system must deeply inspect both the **Reference Frontend** and the **Target Frontend**, compare them at micro-granular level, allow the user to choose exactly which frontend areas to upgrade, then safely implement those selected changes in the target project.

The goal is not simple visual copying.

The goal is to understand the reference site's complete frontend design system, layout behavior, responsive behavior, interaction behavior and component patterns, map those concepts correctly onto the target application's existing architecture, and upgrade the target without breaking functionality.

---

# Current State

The application itself must provide a visual WebApp interface.

The user should be able to:

1. Enter the Reference Website URL.
2. Select the Target source:
   - GitHub repository
   - Live URL
   - Localhost/local running URL
3. Authorize GitHub when required.
4. Run frontend discovery.
5. See scan progress live.
6. Compare Reference vs Target.
7. Filter differences.
8. Preview potential upgrades.
9. Select individual changes, grouped changes, routes, components or the entire frontend.
10. Approve implementation.
11. Watch implementation progress.
12. Review the final result, changed files, verification results and rollback status.

---

# Hard Constraints

Never blindly replace the target frontend.

First understand:

- existing project architecture,
- framework,
- routes,
- components,
- design system,
- shared components,
- application state,
- APIs,
- forms,
- authentication,
- data flows,
- navigation,
- responsive behavior,
- accessibility,
- runtime dependencies.

Preserve all existing working:

- backend/API behavior,
- routes,
- business logic,
- authentication,
- permissions,
- form submissions,
- data,
- state,
- navigation,
- analytics,
- integrations,
- accessibility behavior.

Frontend changes must adapt to the target project instead of forcing the Reference Website's internal architecture onto it.

Do not copy proprietary source code, private assets, trademarks or copyrighted content from a reference website unless the user has authorization.

Design characteristics such as spacing, layout structure, responsive strategy, visual hierarchy, interaction style and component patterns may be analyzed and recreated using the target project's own code and authorized assets.

Every factual design measurement must come from observed runtime evidence whenever technically possible.

Never invent measurements.

Clearly distinguish:

`VERIFIED`
`INFERRED`
`UNAVAILABLE`
`RESTRICTED`

---

# System Architecture

The system should contain these major engines:

### Reference Scanner

Completely inspect the Reference Website frontend.

### Target Scanner

Inspect the target website and, when repository access exists, also inspect its source code and dependency structure.

### Frontend Intelligence Engine

Convert raw browser and code evidence into structured design information.

### Comparison Engine

Compare Reference vs Target at route, layout, component, element, interaction and design-system level.

### Upgrade Planner

Translate selected differences into safe target-project implementation changes.

### Execution Engine

Generate and execute required modifications.

### Verification Engine

Verify visual, responsive, interaction, runtime and functional correctness.

### Git Safety Engine

Handle branches, clean-tree checks, backups, commits, rollback and repository state.

---

# Complete Frontend Discovery

Capture at minimum:

`metadata`
`coverage`
`routes`
`viewports`
`breakpoints`
`layouts`
`components`
`elements`
`designTokens`
`typography`
`colors`
`animations`
`interactions`
`scrollBehavior`
`assets`
`technology`
`libraries`
`resources`
`responsiveChanges`
`accessibilityVisualData`
`restrictions`
`errors`
`statistics`

Evidence sources should include when available:

`computed-style`
`DOMRect`
`attribute`
`CSSRule`
`CSS-variable`
`media-query`
`animation-object`
`performance-resource`
`network-resource`
`framework-runtime-marker`
`source-code evidence`

---

# Route Discovery

Discover every safely reachable frontend route using available evidence including:

- site navigation,
- internal links,
- SPA router behavior,
- sitemap,
- route manifests,
- repository route definitions,
- navigation components,
- generated pages,
- dynamic routes that can safely be inspected.

Map:

`Reference Route → Closest Target Route → Similarity → Differences → Upgrade Opportunities`

Do not brute-force arbitrary URLs.

---

# Layout Analysis

Capture complete page composition including:

page shells, sections, containers, content widths, grids, flex layouts, headers, navigation, sidebars, footers, cards, panels, dialogs, drawers, menus, tables, lists, tabs, accordions, carousels, composers, search interfaces, forms and every user-visible region.

Determine:

- layout hierarchy,
- nesting,
- grid structure,
- columns,
- alignment,
- spacing,
- positioning,
- stacking,
- responsive transformations,
- fixed/sticky regions,
- viewport-relative sizing,
- content constraints.

---

# Element-Level Capture

For every meaningful visible element capture a stable selector or structural path and:

tag
role
ARIA data
visible text
attributes
classes
ID
state
hierarchy
parent relationship
children
siblings
DOM order
bounding rectangle
X/Y position
width
height
min/max dimensions
aspect ratio
margin
padding
gap
border
border radius
outline
shadow
opacity
visibility
overflow
position
inset
z-index
display
flex properties
grid properties
alignment
transform
clip behavior

---

# Component Intelligence

Detect reusable UI patterns and component families such as:

buttons, icon buttons, cards, fields, navigation items, sidebars, headers, search bars, composers, message rows, toolbars, dialogs, drawers, menus, dropdowns, tabs, tables, lists, pagination, badges, status indicators, avatars, empty states, loaders, skeletons, notifications and responsive navigation.

When source access exists, connect rendered components with their actual source files where possible.

Create:

`Rendered Component → Source Component → Styles → Dependencies → Routes Used`

Deduplicate repeated components using structural and visual fingerprints.

---

# Typography

Capture:

font family
resolved font
font source
font size
font weight
font style
line height
letter spacing
word spacing
text transform
text decoration
alignment
wrapping
truncation
responsive typography changes

Identify typography scale and hierarchy.

---

# Colors and Visual Styling

Capture:

foreground colors
backgrounds
gradients
borders
shadows
SVG fills
SVG strokes
opacity
CSS variables
state colors

Normalize when technically possible into:

- original CSS value,
- RGB/RGBA,
- HEX.

Calculate reliable foreground/background contrast ratios.

Identify semantic color roles such as:

primary
secondary
surface
background
text
muted text
border
hover
active
selected
success
warning
error

---

# Design System Extraction

Infer and document reusable design-system structures including:

CSS custom properties
color tokens
spacing scale
radius scale
typography scale
shadow scale
breakpoints
container widths
component dimensions
icon sizing
control heights
content density
layout rhythm
repeated visual patterns

Identify whether the design system is:

- explicit,
- partially explicit,
- or inferred from repeated values.

---

# Responsive Analysis

Automatically inspect representative viewport sizes covering:

small phone
phone
large phone
tablet portrait
tablet landscape
laptop
desktop
large desktop

Also discover every available CSS media-query breakpoint.

For each discovered breakpoint inspect:

`breakpoint - 1px`
`breakpoint`
`breakpoint + 1px`

Record exact changes in:

layout
visibility
navigation
component placement
component size
font size
spacing
ordering
overflow
controls
interaction model

The system must produce responsive differences instead of only screenshots.

---

# Interaction Analysis

Inspect where technically available:

hover
focus
focus-visible
active
pressed
selected
disabled
expanded
collapsed
checked
dragging
loading
success
error states

Capture:

cursor
transition properties
duration
delay
timing function
CSS animation
Web Animations API animation
keyframes
iteration count
direction
easing
playback information

Do not trigger destructive actions simply to inspect a state.

---

# Scroll Behavior

Capture:

scroll containers
sticky elements
fixed elements
scroll snapping
overflow behavior
parallax indicators
scroll-linked animations
view timelines
animation timelines
sticky transitions
observable scroll-triggered changes
reveal effects

Record start/end conditions where measurable.

---

# Assets

Detect:

images
responsive images
`srcset`
`picture`
SVG
icons
icon libraries
favicons
background images
video
poster images
audio
fonts
stylesheets
JavaScript bundles
other frontend resources

Create an organized asset inventory.

When legally and technically allowed, download required reusable assets.

For inaccessible assets record:

source URL
type
location used
route
component
restriction reason

Never silently skip blocked resources.

---

# Frontend Technology Detection

Determine from evidence:

framework
router
rendering model
SPA/MPA/SSR/SSG indicators
CSS architecture
CSS-in-JS
component libraries
UI frameworks
icon libraries
animation libraries
carousel libraries
chart libraries
font providers
build tooling
package manager
frontend dependencies

When repository access exists, verify technology against:

`package.json`
lockfiles
configuration
imports
source files
build scripts

Record dependency versions only when verifiable.

---

# Comparison Engine

After both scans, create a micro-granular Reference vs Target comparison database.

The WebApp must provide a filterable comparison table with columns equivalent to:

`Route`
`Category`
`Subcategory`
`Reference`
`Target`
`Difference`
`Evidence`
`Impact`
`Responsive Impact`
`Source Component`
`Target Component`
`Implementation Scope`
`Dependencies`
`Risk`
`Selected`

Allow filtering by areas such as:

Entire Frontend
Routes
Layout
Navigation
Sidebar
Header
Footer
Components
Buttons
Cards
Forms
Fields
Composer
Search
Tables
Dialogs
Menus
Typography
Colors
Spacing
Icons
Images
Animations
Scrolling
Responsive Design
Mobile UI
Tablet UI
Desktop UI
Accessibility
Design Tokens

The user must be able to select:

one property
one element
one component
one section
one route
one category
multiple categories
or the complete frontend.

---

# Visual Comparison

Provide synchronized Reference and Target previews.

Support:

side-by-side view
overlay comparison
before/after
viewport switching
route switching
component isolation
difference highlighting

Where appropriate, provide visual-difference screenshots as supporting evidence.

Screenshots must not be the only source of truth.

---

# Upgrade Planning

When the user selects changes, determine the correct implementation approach for the target architecture.

Prefer in this order:

1. Existing target design tokens.
2. Existing shared components.
3. Safe extension of existing components.
4. New reusable component.
5. Route-specific styling only when necessary.

Avoid duplicated CSS and duplicated components.

Before mutation show:

affected routes
affected files
shared-component impact
dependencies
packages required
assets required
risk
expected visual result

---

# Dependency Handling

If implementation requires:

package
library
font
icon system
asset
runtime dependency

the system must first determine whether an equivalent already exists.

Reuse existing dependencies when suitable.

Only install new dependencies when necessary.

Before installation verify:

compatibility
license
project framework
package-manager compatibility
version conflicts
bundle impact

Show the user what will be installed and why.

---

# Safe Implementation

For repository-backed projects:

Check repository state first.

Never modify an unverified dirty working tree blindly.

Create a safe working branch/worktree or equivalent isolated implementation environment.

Record the original commit SHA.

Create a rollback point before mutation.

Apply selected changes incrementally.

After each meaningful shared/core change verify that the application still works.

Do not modify backend code unless absolutely required for preserving frontend functionality and explicitly justified.

---

# Execution UI

After the user approves implementation, execute tasks behind the WebApp interface.

Display real-time progress such as:

Scanning Reference
Scanning Target
Discovering Routes
Analyzing Components
Comparing Design Systems
Building Upgrade Plan
Creating Safety Checkpoint
Installing Dependencies
Updating Design Tokens
Updating Components
Updating Routes
Testing Responsive Layout
Checking Runtime Errors
Visual Verification
Final Validation

Each task must display:

status
progress
current operation
affected area
completed work
warnings
errors

---

# Error Handling

If an error occurs:

Do not only display the raw error.

Show:

`What Failed`
`Where`
`Root Cause`
`What Was Changed Before Failure`
`Whether Target State Is Safe`
`Automatic Fix Attempt`
`Required User Action`
`Next Action`

When an automatic safe correction is possible, perform it and verify again.

When continuation is unsafe, stop mutation.

If partial changes could leave the project inconsistent:

rollback → verify rollback → report result.

---

# Verification

After implementation run the minimum sufficient verification required to prove the changed frontend works.

Verify affected:

routes
components
responsive states
interactions
navigation
forms
runtime
console
layout
overflow
assets
animations

Check representative screens and all breakpoints affected by the change.

For shared/core frontend changes, broaden verification to every route using that shared code.

Use browser automation such as Playwright where appropriate.

---

# Completion Criteria

The task is complete only when:

selected frontend changes are implemented
target application still functions
affected routes load correctly
no new critical runtime errors exist
selected responsive states are verified
assets resolve correctly
required dependencies are installed correctly
source tree is valid
rollback information exists
comparison database reflects final state

---

# Final Output

The WebApp must maintain structured artifacts such as:

`reference-audit.json`

Complete structured Reference Website frontend evidence.

`target-before-audit.json`

Target state before modification.

`comparison.json`

Micro-granular differences and mapping.

`selected-upgrades.json`

Exact user-approved changes.

`implementation-plan.json`

Files, components, dependencies, risks and steps.

`target-after-audit.json`

Final frontend state.

`verification.json`

Tests and runtime verification evidence.

`CHANGELOG.md`

Human-readable implemented changes.

`assets/`

Authorized downloaded/generated frontend assets.

`logs/`

Scanner, implementation, dependency and verification logs.

The structured JSON files must be machine-readable and must remain the canonical source of truth.

---

# Platform Requirements

Support:

Windows 11
macOS

Do not depend on OS-specific paths internally.

Use platform-safe path handling and process execution.

Detect and support the target project's existing package manager where possible:

npm
pnpm
yarn
bun

The local WebApp should automatically open in the user's browser and operate through localhost.

---

# Required Evidence

Every comparison or implementation decision must be traceable back to evidence.

Example:

`Reference Element`
→ `Observed Runtime Properties`
→ `Target Equivalent`
→ `Detected Difference`
→ `Selected Upgrade`
→ `Affected Source File`
→ `Implementation`
→ `Post-change Runtime Evidence`

Never mark an upgrade successful only because code was modified.

Success requires final runtime proof.

---

# Prohibited Actions

Do not blindly clone the complete Reference Website.

Do not replace business functionality with visual placeholders.

Do not remove existing routes or functionality.

Do not invent unavailable measurements.

Do not claim inaccessible resources were inspected.

Do not install unnecessary packages.

Do not duplicate existing libraries unnecessarily.

Do not modify unrelated files.

Do not force Reference Website architecture onto the target.

Do not continue after an unsafe partial failure.

Do not mark implementation complete without final verification.

---

# Final Goal

The final system should operate like a **Frontend Reverse-Engineering + Comparison + Selective Upgrade Studio**.

The user gives:

`Reference Frontend + Target Project`

The system produces:

`Complete Frontend Intelligence`

then:

`Reference vs Target Comparison`

then allows:

`User-selected Upgrades`

then performs:

`Safe Automated Implementation`

and proves the result through:

`Runtime + Responsive + Visual + Functional Verification`

The final upgraded target must preserve its existing application functionality while achieving the selected Reference-inspired UI/UX improvements as accurately as technically and legally possible.