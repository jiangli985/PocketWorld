# 潮汐小馆素材来源

- `bay-dusk.webp` 为 384 × 384 的黄昏海湾图集。背景和透明船体用内置 ImageGen 分别生成，前 288 行保存海湾，从第 289 行起左侧放船体，右侧是游戏原有的八个 40 × 22 鱼形格。图鉴和上鱼动画共用鱼形。
- `dock-street.webp` 是原创黄昏码头街景，400 × 300，用内置 ImageGen 制作并压缩为 WebP。用户参考图提供像素风、沿街店铺与暖灯的方向，两块招牌的中文采用手绘像素字，在游戏加载街景时合成，沿用原画中的灯位与色调。


- `tackle-interior.webp` 和 `market-interior.webp` 是用内置 ImageGen 制作的原创室内场景，各 400 × 300，进入对应店铺时加载。渔具、灯和柜台绘在底图中，挂板上的可选鱼竿由 Canvas 绘制。
- `career-gallery.webp` 为 400 × 300 的东湾荣誉室。用内置 ImageGen 参考大排档的像素材质生成原创木展墙、侧窗与黄铜灯，进入钓鱼生涯时加载。

- `tavern-mark.webp` 是 24 × 24 的透明像素小馆徽标，以像素矩形手绘红瓦、暖灯、招牌和码头倒影，应用于游戏共用页眉和房间内的实体卡带。

- `seafood-menu.webp` 为 384 × 288 的透明菜品图集。以 ImageGen 内置模式绘制 4 × 4 的中式海边大排档像素菜图，按烤鱼与烤鱿鱼、蒸笼海鲜与蒸鱼、寿司与刺身的菜谱顺序排列。提示要求暖灯、清晰轮廓、各菜独立摆盘及透明留白。打包时为单格留出边距。

<details>
<summary>菜品图集提示词</summary>

Use case: stylized-concept. Asset type: one transparent sprite atlas for Tide Tavern, a Chinese coastal pixel-art fishing game. Produce ONE square sheet, exactly 4 columns by 4 rows of 16 individually isolated plated dishes. Strict evenly spaced 4×4 atlas: centers at exactly 12.5%, 37.5%, 62.5%, 87.5% along each axis, equal square cells, each food object centered in its cell, about 74% of the cell width with generous clear padding on all sides. Keep every bit of each dish inside its own cell. No grid lines or UI. Pure transparency between dishes. No text, numbers, labels, props outside the food, table, frames, or watermarks. Pixel art with deliberately blocky edges, warm lantern highlights, clean dark hand-drawn rim outlines and small rich color clusters. Cozy Chinese coastal night-market food, three-quarter overhead view, vivid silhouettes for small readable 36 px menu thumbnails. Render the plate, bamboo steamer or serving board as part of the cutout. Cell assignments in row-major order, no substitutions or swapping:
ROW 1: (1) whole salt-grilled silver fish with golden crisp skin on oval dark brown plate; (2) two caramel-glazed miso mackerel fillets with char lines on a cream ceramic plate; (3) two slim deeply charcoal-grilled herring with charred blue-silver skin on a brick-red plate; (4) two red-orange squid skewers with visible spiral tentacles on a rectangular wood board.
ROW 2: (1) one long grilled flying fish, dramatic flared wings, orange glaze on a dark wood platter; (2) grilled flatfish, broad flat diamond shape with amber char, on a dark blue round dish; (3) assorted steamed seafood with variety of rosy snapper pieces, small white squid rings and deep pink tuna morsels in a round honey bamboo steamer; (4) silver-white steamed sea bass on a blue-edged white oval plate with visible ginger slivers and stripes of bright scallion.
ROW 3: (1) whole coral-red steamed snapper with scattered black fermented beans in dark brown sauce and green scallion on an ivory platter; (2) several slim silver anchovies fanned on a blue-white plate under green scallion oil; (3) whole warm golden yellow croaker with julienned ginger and scallion on a jade ceramic plate; (4) two classic fish nigiri with pale sushi rice and subtle amber fish topping on a rectangular stoneware plate.
ROW 4: (1) premium sushi sampler of deep pink tuna nigiri, red snapper nigiri and squid nigiri on a lacquered vermilion board; (2) two upright sardine temaki hand roll cones, dark nori and silver sardine slices visible, on a wooden plate; (3) four ruby bluefin tuna sashimi slices fanned with a tiny shiso leaf on dark navy small plate; (4) three square pressed lanternfish oshizushi blocks with pale rice and iridescent lilac and blue-gray fish tops on a warm lacquer tray. Keep each cell visually distinct.

</details>
