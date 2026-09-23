# MuscleMap — geometry provenance

The isolated Kindra prototype adapts polygon data from:

- `giavinh79/react-body-highlighter`, revision `d03fcd8740033721a51f5a2682de02ec31df92ba`, `src/assets/index.ts`.
  Source: https://github.com/giavinh79/react-body-highlighter/blob/d03fcd8740033721a51f5a2682de02ec31df92ba/src/assets/index.ts
  License: https://github.com/giavinh79/react-body-highlighter/blob/d03fcd8740033721a51f5a2682de02ec31df92ba/LICENSE
- That project's README explicitly credits `HichamELBSI/react-native-body-highlighter` for the SVG polygons.
  The upstream initial revision `633bee1ad898b6d1b68a8fe1f98ff3f2afa2b4bc` includes `libs/assets/bodyFront.js` and `bodyBack.js`, and declares MIT in `package.json`.
  Source: https://github.com/HichamELBSI/react-native-body-highlighter/tree/633bee1ad898b6d1b68a8fe1f98ff3f2afa2b4bc/libs/assets
  Original license declaration: https://github.com/HichamELBSI/react-native-body-highlighter/blob/633bee1ad898b6d1b68a8fe1f98ff3f2afa2b4bc/package.json
  Upstream license text: https://github.com/HichamELBSI/react-native-body-highlighter/blob/main/LICENSE

Verified 2026-09-20. The original anterior coordinate arrays correspond to the scaled/rounded polygons in the web adaptation. This records the published source chain and licenses, not an independent certification of anatomical accuracy.

Kindra modifications: replace external enum/type imports with local string keys; retain polygon coordinates; add static category-based colors, patterns, textual descriptions, accessible SVG identifiers and responsive layout. No intensity/frequency inference. Only the approved pilot groups are mapped; unreviewed upstream region names are not used to infer additional anatomy.

## MIT notices

Copyright (c) 2020 GV79

Copyright (c) 2022 ELABBASSI Hicham

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
