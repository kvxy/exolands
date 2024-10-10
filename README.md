# Exolands

#### WebGL Voxel Rasterizer

Exolands is a voxel world rasterized using WebGL2. Please wait a few seconds for chunks to load when opening webpage. Also please use a browser with JavaScript and WebGL2 enabled.

[kvxy.github.io/exolands](https://kvxy.github.io/exolands/)

![Preview Image](assets/preview.png?raw=true "Preview Image")

Use WASD to move, right-click to place block, left-click to delete block, and ctrl to lock your cursor.

---

Features include:
- Block placing/destroying
- Transparent blocks
- World generation using OpenSimplex noise

---

Optimizations:
- Vertex chunking
- Face culling
- Vertex packing optimized for 32x32x32-sized voxel chunks
- Customized transparent face sorting algorithm for voxel-based enviorment
- DDA voxel traversal algorithm for block-intersection detection