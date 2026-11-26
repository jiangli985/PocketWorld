export type Vec3 = [number, number, number];
export const BOOK_SIZE = { thickness: 0.105, height: 0.22, depth: 0.24 };
export const BOOK_SLOTS = [0.6675, 0.9575, 1.2475].flatMap((floor, row) =>
  Array.from({ length: 6 }, (_, column) => ({ id: `s${row}-${column}`, row, column, position: [-0.405 + column * 0.162, floor + BOOK_SIZE.height / 2, 0.08] as Vec3 })));
export const CAPACITY = BOOK_SLOTS.length;
export const INPUT_LIMIT = 128 * 1024;
export const TOTAL_LIMIT = 512 * 1024;
export const LIBRARY_KEY = 'pocketworld:library:collection:v1';
export interface LibraryBook { id: string; source: 'builtin' | 'user'; title: string; author: string; text: string; color: string; slotId: string; anchor: number }
export interface LibraryData { version: 1; revision: number; books: LibraryBook[] }
const colors = ['#617e79', '#aa7c48', '#815e70', '#697c9d', '#a45f48', '#78834f'];
export const byteLength = (text: string) => new TextEncoder().encode(text).length;
export const normalizeText = (text: string) => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
const stories = [
  ['最后一片叶子', '欧·亨利 · 中文自译', [
    `华盛顿广场以西有一小片街区，那里的街道像是发了疯，把自己折成一截截被称作“小巷”的短路。这些小巷拐出古怪的角度和弧线，有条街甚至和自己交叉一两回。一位画家曾在这里发现了一个大有用处的可能：假如收账人拿着颜料、画纸和画布的账单走进来，兜来转去，忽然迎面碰见了正在空手往回走的自己，那会怎样！

于是，搞艺术的人纷纷来到这古色古香的格林尼治村，四处寻觅朝北的窗户、十八世纪的山墙、荷兰式阁楼，还有便宜的房租。再从第六大道搬来几只白镴酒杯、一两只保温食物的小炉子，一个艺术家的“聚居地”就这样成立了。

苏和琼西的画室在一幢低矮的三层砖房顶楼。“琼西”是乔安娜的昵称。一个来自缅因州，另一个来自加利福尼亚。两人在第八街一家挂着“德尔莫尼科”招牌的餐馆吃套餐时相识，发现彼此对于艺术、菊苣沙拉和主教式宽袖的品味如此相投，合用的画室便由此诞生。

那是五月的事。到了十一月，一位冰冷而看不见的陌生客在聚居地里游荡，用冰似的手指这里碰一个，那里碰一个。医生们管他叫肺炎。在东区，这个破坏者大步横行，一批批地击倒人；走进狭窄、长满青苔、迷宫一般的小巷时，他的脚步却慢了下来。

肺炎先生可算不上什么讲骑士风度的老绅士。一个被加州暖风吹得体弱血薄的小女子，原不该成为这位红拳头、直喘气的老家伙的猎物。可他偏偏击中了琼西。她躺在刷过漆的铁床上，几乎一动不动，透过荷兰式小格窗，望着隔壁砖房那面空白的墙。

一天早上，忙碌的医生扬了扬蓬乱的灰眉毛，示意苏到走廊里来。

“她活下来的机会，大概——就算十分之一吧。”他一边甩着体温计，一边说，“而且这还得看她自己愿不愿意活。病人要是站到殡仪业者那一边，整部药典都成了笑话。你这位小姑娘已经认定自己不会好了。她有什么心事吗？”

“她——她想有一天去画那不勒斯湾。”苏说。

“画画？胡扯！有没有值得认真想一想的事？比如，某个男人？”

“男人？”苏的声音绷得像口弦琴，“男人值得——没有，医生，没有这种事。”

“那么，就是身体太虚弱了。”医生说，“科学能做到的，我都会尽力去做。但只要病人开始数自己送葬队伍里的马车，我就得把药物的效力打个对折。要是你能让她问一句今年冬天斗篷的袖子流行什么新样式，我就敢说她有五分之一的机会，而不是十分之一。”

医生走后，苏回到工作间，把一块日本纸巾哭成了纸浆。随后，她抱着画板，大模大样地走进琼西的房间，吹着拉格泰姆曲子的口哨。

琼西面朝窗子躺着，被子底下几乎看不出一点起伏。苏以为她睡着了，便停止了吹口哨。

苏摆好画板，开始为杂志上的一篇小说画钢笔插图。年轻作家写杂志小说，是为了给自己铺一条通向文学的路；年轻画家替这些小说作画，则是为了铺一条通向艺术的路。

故事的主人公是个爱达荷州牛仔。苏正给他添上一条时髦得适合参加马展的马裤和一副单片眼镜，忽然听见低低的声音，反复响了几次。她连忙走到床边。琼西睁大眼睛望着窗外，正在数数——倒着数。

“十二。”她说。过了一会儿，“十一。”接着是“十”和“九”，随后“八”和“七”几乎连在了一起。

苏担心地朝窗外望去。有什么可数的呢？眼前只有一个空荡凄凉的院子，以及二十英尺外砖房光秃秃的侧墙。一株很老很老的常春藤爬到砖墙半腰，根部盘结，已经腐朽。秋天冰冷的气息打落了藤上的叶子，只剩下骨架般的枝条，几乎赤裸地攀在剥蚀的砖面上。

“亲爱的，怎么了？”苏问。

“六。”琼西的声音几乎只是耳语，“现在掉得更快了。三天前还有将近一百片，数得我头疼。现在就容易了。又掉了一片。只剩五片了。”

“五片什么，亲爱的？告诉你的苏迪。”

“叶子。常春藤上的叶子。最后一片掉下来，我也得走了。我三天前就知道了。医生没告诉你吗？”

“哎呀，我可从没听过这么荒唐的话！”苏满脸不屑地抗议，“老常春藤的叶子，跟你的病好不好有什么关系？你以前那么喜欢那株藤，真是个淘气姑娘。别犯傻啦。医生今天早上告诉我，你很快就能好起来，机会是——让我想想他怎么说的——他说十比一！这差不多跟我们在纽约坐电车，或者从正在施工的楼旁走过一样保险。现在试着喝一点汤，让苏迪回去画画，好把画卖给编辑先生，给她生病的小孩买波特葡萄酒，再给她自己这个馋鬼买猪排。”

“不必再买酒了。”琼西仍目不转睛地望着窗外，“又掉了一片。不，我不想喝汤。只剩四片了。我想在天黑前看见最后一片掉下来。然后，我也走。”

“琼西，亲爱的，”苏俯下身说，“答应我，在我画完以前闭上眼睛，不要往窗外看，好吗？这些画明天就得交。我需要亮光，不然早把窗帘放下来了。”

“你不能去另一间屋画吗？”琼西冷冷地问。

“我更想在这里陪着你。”苏说，“而且，我也不想让你老盯着那些傻乎乎的常春藤叶子。”

“画完就告诉我。”琼西说。她闭上眼睛，苍白而静止，像一尊倒下的雕像。“因为我想看着最后一片叶子落下来。我等累了，也想累了。我想松开手，不再抓住任何东西，就像那些可怜的、疲倦的叶子一样，飘下去，飘下去。”

“试着睡一会儿吧。”苏说，“我得叫贝尔曼上来，给画里的老隐居矿工当模特。我马上回来。我回来之前，别乱动。”

老贝尔曼是个画家，住在她们楼下的一层。他已经六十多岁，胡子像米开朗琪罗雕的摩西那样，从一张萨堤尔似的脸上卷曲着垂下来，沿着小妖怪般的身躯拖着。贝尔曼在艺术上是个失败者，挥舞画笔四十年，却始终没能靠近艺术女神，连她长袍的衣角都没有碰到。他总说自己就要画一幅杰作，却一次也没有真正动笔。近几年，他除了偶尔替商店或广告涂抹些东西，几乎不再画画。他靠给聚居地里请不起专业模特的年轻画家摆姿势，挣一点小钱。他喝起杜松子酒来没个节制，却仍旧谈论着那幅尚未问世的杰作。除此之外，他是个脾气凶的小老头，见不得任何人露出软弱的样子，仿佛自己是一条专门守在楼下、保护楼上那两个年轻画家的獒犬。

苏在楼下那间昏暗的小屋里找到贝尔曼，浓浓的杜松子气味从他身上散出来。角落的画架上放着一块空白画布，已经在那里等了二十五年，等着那幅杰作的第一笔。她把琼西的念头告诉了他，也说出自己的担心：琼西本就像叶子一样轻薄脆弱，倘若抓住世界的那一点力气再松下去，也许真的就会飘走。

老贝尔曼的红眼睛里分明淌着泪，他却扯开嗓门，大声嘲笑、斥责这种愚蠢的想法。

“什么！”他操着浓重的德国口音吼道，“世上真有这种傻瓜，只因为该死的藤上掉几片叶子，就要去死？我从来没听说过！不，我不给你那个傻头傻脑的隐士当模特！你怎么能让这种蠢念头钻进她脑袋里？唉，可怜的小琼西小姐！”

“她病得很重，又虚弱。”苏说，“发烧使她的心思变得很不正常，满脑子都是古怪的想象。好吧，贝尔曼先生，你要是不愿意给我当模特，那就不必了。不过我觉得你真是个讨厌的老——老糊涂虫。”

“你们女人就是这样！”贝尔曼嚷道，“谁说我不当模特了？走，我跟你去！这半个钟头，我一直在说我准备好啦。天哪！琼西小姐这样好的姑娘，不该躺在这种地方生病。总有一天，我要画出一幅杰作，然后咱们全搬走。天哪！一定！”

他们上楼时，琼西正睡着。苏把窗帘一直拉到窗台，示意贝尔曼去另一间屋。在那里，两人忧心忡忡地从窗子里望着常春藤。

随后，他们对视了片刻，谁也没有说话。外头下着冷雨，夹杂着雪，久久不停。贝尔曼穿着旧蓝衬衫，坐到一只倒扣的大水壶上，把它当成岩石，摆起隐居矿工的姿势。

第二天早上，苏才睡了一个钟头就醒来，看见琼西双眼睁得大大的，目光黯淡，紧盯着放下的绿色窗帘。

“拉上去，我要看。”她低声命令。

苏疲惫地照办了。

可是，看哪！经过一整夜暴雨的抽打和狂风的撕扯，砖墙上竟还显着一片常春藤叶子。那是藤上的最后一片叶子。靠近叶柄的地方仍是深绿，锯齿形的边缘却已染上衰败枯朽的黄色。它勇敢地挂在离地约二十英尺的枝头。

“最后一片了。”琼西说，“我以为它夜里一定会掉。我听见风了。今天它就会掉，我也会同时死去。”

“亲爱的，亲爱的！”苏把憔悴的脸俯到枕边，“就算你不想自己，也想想我吧。我该怎么办呢？”

琼西没有回答。世界上最孤独的，莫过于一颗正准备踏上神秘远途的灵魂。维系她与友谊、与尘世的细线，一根根松开，那古怪的念头似乎反而攥得更紧了。

白天慢慢过去。即使暮色降临，她们仍能看见那片孤零零的常春藤叶贴着墙，紧紧连在叶柄上。夜一到，北风又挣脱了束缚，雨水仍击打着窗户，从低低的荷兰式屋檐滴滴答答地落下来。

天色刚刚亮到可以看清东西，琼西便毫不留情地命令把窗帘拉起。

那片常春藤叶还在那里。

琼西躺着，久久地望着它。然后，她叫了苏一声。苏正在煤气炉边搅着给她煮的鸡汤。

“苏迪，我真是个坏姑娘。”琼西说，“一定有什么让最后那片叶子留在那里，好让我知道自己有多不应该。想要死去，是不对的。现在给我拿一点汤吧，再来点掺了少许波特酒的牛奶，还有——不，先拿一面小镜子来，再在我身边垫些枕头。我想坐起来，看你做饭。”

一个钟头以后，她又说：

“苏迪，我希望有一天能去画那不勒斯湾。”

下午，医生来了。他离开时，苏找了个由头跟到走廊里。

“一半对一半。”医生握住苏那只瘦削、发颤的手说，“好好护理，你们会赢的。现在我还得去看楼下另一个病人，叫贝尔曼——我想，也是个画家。他也得了肺炎。人老了，又虚弱，这次发病很急，已经没希望了。不过今天会送他去医院，让他舒服一点。”

第二天，医生对苏说：“她已经脱离危险。你们赢了。接下来只需要营养和照料。”

那天下午，琼西躺在床上，心满意足地织着一条蓝得很、却实在没什么用处的羊毛披肩。苏来到床边，伸出一只胳膊，把她连同枕头一起搂住。

“小白鼠，有件事我要告诉你。”苏说，“贝尔曼先生今天在医院里因肺炎去世了。他只病了两天。头一天早上，管理员在楼下的房间发现了他。他疼得动不了，鞋子和衣服全湿透了，冰凉冰凉的。谁也想不出，那么可怕的夜里，他到底去了哪里。后来，他们找到了一盏还亮着的灯笼、一架被挪过地方的梯子、几支散落的画笔，还有一块调着绿色和黄色颜料的调色板。亲爱的，你看看窗外，看看墙上最后那片常春藤叶。你没有奇怪过吗，为什么风吹来的时候，它从不颤动，也从不摇摆？啊，亲爱的，那就是贝尔曼的杰作——在最后一片叶子落下的那个夜晚，他把它画在了那里。”`,
  ]],
  ['窗外的地球', 'PocketWorld · 原创', [
    '第一章 · 蓝色\n\n第一次认真观察海洋时，我才知道蓝色有这么多层次。近岸的浅绿像被水泡软的玻璃，远处则深得几乎没有边界。地图上的国界在这里看不见。\n\n我拿出旧笔记本，想找一个准确的颜色名称。写了又划去，最后只留下：今天的海很好看。',
    '第二章 · 云的影子\n\n云不是贴在地表的一层白漆。太阳斜过来时，云团在海面投下清楚的影子，一边明亮，一边安静地暗着。风把它们推向不同的方向。\n\n我跟着一片长云看了好久，直到它出了窗框。生活舱没有停，云也没有停，我们只在这一小段时间里同行。',
    '第三章 · 海岸\n\n海岸不像纸上的线那样利落。河口把泥沙送入海中，颜色缓缓散开，像一封字迹洇开的信。岛屿围着浅滩排列，灯光尚未亮起。\n\n小时候去过的海边也在下面，只是太小，认不出来。我记得那里石阶的温度，记得鞋子里进了沙。这些细节，远比坐标可靠。',
    '第四章 · 山脉\n\n雪线沿山峰蜿蜒，像有人用白线补好了一块旧布。背光的山谷很深，太阳一点点把它们照亮。一个白昼，在不同地方有不同的开始。\n\n我把额头靠近舷窗，玻璃微凉。那些山保持了很久的沉默，人类为它们取名字、画地图，它们仍只依自己的速度变化。',
    '第五章 · 夜面\n\n城市的灯先在海岸出现，然后沿道路伸入内陆。不是每一片土地都明亮，黑暗也不等于无人居住。有人刚关灯，有人正守着炉火。\n\n我不再试着数那些光点。它们让我想起一张饭桌，碗筷摆好，窗户开着，有人听见门响便抬起头。',
    '第六章 · 再看一次\n\n看得越久，越难用一张照片概括地球。它有天气，有季节，有不断移动的阴影。今天看过的风景，下一次经过时已经改变。\n\n我合上笔记本，决定明天再看一次。熟悉一个地方，也许不是终于知道它的全部，而是愿意一次又一次，认真地望向它。',
  ]],
  ['微光旅行札记', 'PocketWorld · 原创', [
    '第一章 · 出发\n\n出发那天，林把一张空白明信片放进包里。她说，要等见到最想分享的风景再写。车站很拥挤，广播念着陌生的地名，她却只记得母亲替她拉好围巾。\n\n后来列车离开地面，城市缩成一片光。林没有拍照，只把明信片从包里取出来，看了看背面那条细细的横线。',
    '第二章 · 同行者\n\n邻座是一位修理钟表的老人。他去远方给孙女送一只小钟，钟面上画着一艘船。老人说，旅途太长，总要有些东西提醒人按时吃饭。\n\n林问钟走得准不准。老人笑着摇头，说它每天慢一分钟。正因为如此，收礼物的人每天都会想起调整它，也就会想起送礼物的人。',
    '第三章 · 中途站\n\n中途站只有一扇很大的窗。旅客在窗前站成安静的一排，看远处的尘埃带被星光照亮。没有人催促，也没有人找到一句特别合适的话。\n\n林终于拿出笔，却发现墨水凝在笔尖。她在掌心里暖了一会儿，先写下日期。日期旁边画了一个小点，表示自己曾站在这里。',
    '第四章 · 微光\n\n航行的第三夜，窗外出现一颗很暗的星。它不在导航屏最显眼的位置，却一直伴着他们。林想到老人的小钟，想到地面有人每天等一封信。\n\n她写道：这里没有想象中那么亮，但黑暗里能看见许多微小的光。写完这句，她忽然知道明信片要寄给谁了。',
    '第五章 · 回程票\n\n目的地的工作比预想中顺利。林修好观测站的信号线，把工具一件件放回箱子。准备订下一段旅程时，她停了一下，买了一张回程票。\n\n离开不一定是为了走得更远。她想起窗前那一排沉默的人，想起围巾上熟悉的洗衣皂气味。箱子仍很轻，心里却装了很多东西。',
    '第六章 · 门口\n\n门打开的时候，屋里的灯正好亮起。母亲问路上累不累，林说不累，然后在椅子上坐了很久。包里的明信片已经寄出，会比她晚几天到家。\n\n她没有急着讲那些壮丽的风景，只先帮忙摆好碗筷。窗外有一颗星，暗得几乎看不见。林知道它在那里，便觉得这一趟旅行已经有了完整的结尾。',
  ]],
] as const;
export const BUILTIN_BOOKS: LibraryBook[] = stories.map(([title, author, chapters], i) => ({ id: `book-0${i + 1}`, source: 'builtin', title, author, text: chapters.join('\f'), color: colors[i], slotId: BOOK_SLOTS[6 + 1 + i].id, anchor: 0 }));
export const freshLibrary = (): LibraryData => ({ version: 1, revision: 0, books: BUILTIN_BOOKS.map(book => ({ ...book })) });
// Shelf-local +Z faces the reader. The baked clips keep this frame in both rooms.
export const shelfOrigin = (scene: string): Vec3 => scene === 'habitat' ? [3.71, 0, 1.40] : [-3.28, 0, -.65];
export const shelfYaw = (scene: string) => scene === 'habitat' ? -Math.PI / 2 : 0;
export const shelfVector = (scene: string, x: number, y: number, z: number): Vec3 =>
  scene === 'habitat' ? [-z, y, x] : [x, y, z];
export function shelfPoint(scene: string, x: number, y: number, z: number): Vec3 {
  const origin = shelfOrigin(scene), v = shelfVector(scene, x, y, z);
  return [origin[0] + v[0], origin[1] + v[1], origin[2] + v[2]];
}
export const readingStand = (scene: string): Vec3 => shelfPoint(scene, 0, 0, .87);
export const slotFor = (book: LibraryBook) => BOOK_SLOTS.find(slot => slot.id === book.slotId)!;

// Reconcile presets in memory; only normal locked writes persist changes.
function reconcileBuiltinBooks(data: LibraryData): LibraryData {
  if (BUILTIN_BOOKS.every(preset => data.books.some(book => book.id === preset.id && book.slotId === preset.slotId
    && book.title === preset.title && book.author === preset.author && book.text === preset.text))) return data;
  const presets = new Map(BUILTIN_BOOKS.map(book => [book.id, book]));
  const occupied = new Set(BUILTIN_BOOKS.map(book => book.slotId));
  for (const book of data.books) if (book.source === 'user' && !occupied.has(book.slotId)) occupied.add(book.slotId);
  const books = data.books.map(book => {
    const preset = presets.get(book.id);
    if (preset) return { ...book, title: preset.title, author: preset.author, text: preset.text, slotId: preset.slotId, anchor: book.text === preset.text ? book.anchor : 0 };
    if (!BUILTIN_BOOKS.some(preset => preset.slotId === book.slotId)) return book;
    const slot = BOOK_SLOTS.find(slot => !occupied.has(slot.id))!;
    occupied.add(slot.id);
    return { ...book, slotId: slot.id };
  });
  return { ...data, books };
}

export function readLibrary(storage: Pick<Storage, 'getItem'>): LibraryData {
  const value = storage.getItem(LIBRARY_KEY);
  if (!value) {
    const data = freshLibrary();
    const legacy = JSON.parse(storage.getItem('pocketworld:library:books') ?? '[]');
    if (!Array.isArray(legacy) || legacy.length > CAPACITY - 3) throw new Error('旧藏书需要整理，原记录已保留。请先导出旧藏书再重试。');
    for (const old of legacy) {
      if (!old || typeof old.id !== 'string' || !old.id.startsWith('visitor-') || data.books.some(b => b.id === old.id) || (old.author !== undefined && typeof old.author !== 'string') || typeof old.title !== 'string' || !Array.isArray(old.pages) || !old.pages.every((p: unknown) => typeof p === 'string')) throw new Error('旧藏书记录损坏，原记录已保留。');
      data.books.push(makeUserBook(data, old.title, old.author ?? '', old.pages.join('\n\n'), String(old.id)));
    }
    return data;
  }
  let data: LibraryData;
  try { data = JSON.parse(value); } catch { throw new Error('藏书记录无法解析，原记录已保留，请导出站点数据后修复。'); }
  const ids = new Set<string>(), slots = new Set<string>();
  if (data?.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0 || !Array.isArray(data.books) || data.books.length > CAPACITY) throw new Error('藏书版本或容量异常，未覆盖原记录。');
  for (const book of data.books) {
    if (!book || typeof book.id !== 'string' || ids.has(book.id) || !BOOK_SLOTS.some(slot => slot.id === book.slotId) || slots.has(book.slotId)
      || !['builtin', 'user'].includes(book.source) || typeof book.title !== 'string' || !book.title.trim() || book.title.length > 80
      || typeof book.author !== 'string' || book.author.length > 60 || typeof book.text !== 'string' || !book.text.trim()
      || (book.source === 'user' && byteLength(book.text) > INPUT_LIMIT) || !/^#[\da-f]{6}$/i.test(book.color)
      || !Number.isSafeInteger(book.anchor) || book.anchor < 0 || book.anchor > book.text.length) throw new Error('部分藏书记录损坏，未覆盖原记录。');
    ids.add(book.id); slots.add(book.slotId);
  }
  if (data.books.filter(b => b.source === 'user').reduce((n, b) => n + byteLength(b.text), 0) > TOTAL_LIMIT
    || BUILTIN_BOOKS.some(b => !data.books.some(saved => saved.id === b.id && saved.source === 'builtin'))
    || data.books.some(b => b.source === 'builtin' && !BUILTIN_BOOKS.some(preset => preset.id === b.id))) throw new Error('藏书配置异常，未覆盖原记录。');
  return reconcileBuiltinBooks(data);
}
export const USER_BOOK_LIMIT = CAPACITY - BUILTIN_BOOKS.length;
export const userBookCount = (data: LibraryData) => data.books.filter(book => book.source === 'user').length;
export const userBookBytes = (data: LibraryData) => data.books.filter(book => book.source === 'user').reduce((total, book) => total + byteLength(book.text), 0);
export function remainingBookCapacity(data: LibraryData) {
  const slotsLeft = Math.max(0, CAPACITY - data.books.length);
  const usedBytes = userBookBytes(data);
  const bytesLeft = Math.max(0, TOTAL_LIMIT - usedBytes);
  const fullReason = slotsLeft === 0
    ? `书柜已满（${CAPACITY}/${CAPACITY}），请先移除一本自添书籍。`
    : bytesLeft === 0
      ? '自添书空间已满（512 / 512 KiB），请先移除一本自添书籍。'
      : null;
  return { slotsLeft, usedBytes, bytesLeft, canAdd: slotsLeft > 0 && bytesLeft > 0, fullReason };
}
export const formatBookBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes % 1024 === 0 ? 0 : 1)} KiB`;
export const isSupportedBookFileName = (name: string) => /\.(txt|md)$/i.test(name.trim());
export const titleFromBookFileName = (name: string) => name.trim().replace(/\.(txt|md)$/i, '').slice(0, 80);
export interface ParsedBookFile { title: string; text: string; bytes: number; fileName: string }
export function validateBookFileMeta(file: { name: string; size?: number }, data: LibraryData): string | null {
  const capacity = remainingBookCapacity(data);
  if (capacity.fullReason) return capacity.fullReason;
  if (!isSupportedBookFileName(file.name)) return '仅支持 UTF-8 编码的 .txt 或 .md 本地文件。';
  if (typeof file.size === 'number') {
    if (file.size <= 0) return '文件为空，请选择有正文的文件。';
    if (file.size > INPUT_LIMIT * 4) return '文件超过 128 KiB 上限，请缩短后重试。';
  }
  return null;
}
export function parseBookFileBytes(file: { name: string; buffer: ArrayBuffer | Uint8Array }, data: LibraryData): ParsedBookFile {
  const bytes = file.buffer instanceof Uint8Array ? file.buffer : new Uint8Array(file.buffer);
  const metaError = validateBookFileMeta({ name: file.name, size: bytes.byteLength }, data);
  if (metaError) throw new Error(metaError);
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('文件不是有效的 UTF-8 纯文本，请重新导出后再上传。');
  }
  if (decoded.includes('\0')) throw new Error('文件不是有效的 UTF-8 纯文本，请重新导出后再上传。');
  const text = normalizeText(decoded);
  if (!text) throw new Error('文件为空，请选择有正文的文件。');
  const textBytes = byteLength(text);
  if (textBytes > INPUT_LIMIT) throw new Error('单本正文不能超过 128 KiB，请缩短后重试。');
  if (data.books.some(book => normalizeText(book.text) === text)) throw new Error('这份正文已在书柜中，请直接阅读已有书籍。');
  const { usedBytes } = remainingBookCapacity(data);
  if (usedBytes + textBytes > TOTAL_LIMIT) throw new Error('自添正文合计不能超过 512 KiB，请先移除一本或选择更小的文件。');
  return { title: titleFromBookFileName(file.name) || '未命名书籍', text, bytes: textBytes, fileName: file.name };
}
export function makeUserBook(data: LibraryData, title: string, author: string, input: string, id = `visitor-${crypto.randomUUID()}`): LibraryBook {
  const text = normalizeText(input);
  if (!title.trim() || !text) throw new Error('请上传有效的本地文本文件并填写书名。');
  if (title.trim().length > 80 || author.trim().length > 60) throw new Error('书名最多 80 字，作者最多 60 字。');
  if (byteLength(text) > INPUT_LIMIT) throw new Error('单本正文不能超过 128 KiB，请缩短后重试。');
  if (data.books.some(book => normalizeText(book.text) === text)) throw new Error('这份正文已在书柜中，请直接阅读已有书籍。');
  if (userBookBytes(data) + byteLength(text) > TOTAL_LIMIT) throw new Error('自添正文合计不能超过 512 KiB，请先移除一本。');
  const slot = BOOK_SLOTS.find(slot => !data.books.some(book => book.slotId === slot.id));
  if (!slot) throw new Error(`书柜已满（${CAPACITY}/${CAPACITY}），请先移除一本自添书籍。`);
  return { id, source: 'user', title: title.trim(), author: author.trim() || '访客', text, slotId: slot.id, color: colors[slot.column % colors.length], anchor: 0 };
}
export async function mutateLibrary(change: (data: LibraryData) => LibraryData, allowed: () => boolean = () => true): Promise<LibraryData> {
  if (!navigator.locks) throw new Error('此浏览器不支持安全保存藏书，请使用新版 Chromium 或 Safari。');
  return navigator.locks.request('pocketworld:library:write', async () => {
    if (!allowed()) throw new Error('请在书柜选书状态操作。');
    const previous = readLibrary(localStorage);
    const next = change(previous);
    next.revision = previous.revision + 1;
    try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(next)); } catch { throw new Error('浏览器存储不可用或空间不足，原藏书未改动。请释放空间后重试。'); }
    return next;
  });
}
export interface TextPage { start: number; end: number; text: string }
export function paginate(text: string, width: number, lines: number, measure: (character: string) => number): TextPage[] {
  const pages: TextPage[] = [];
  let start = 0, line = 1, used = 0, cursor = 0;
  const finish = (end: number) => { if (end > start) pages.push({ start, end, text: text.slice(start, end).replace(/\f/g, '') }); start = end; line = 1; used = 0; };
  for (const character of text) {
    if (character === '\f') { finish(cursor + 1); cursor += character.length; continue; }
    const advance = character === '\n' ? 0 : measure(character === '\t' ? '　　' : character);
    if (character !== '\n' && used > 0 && used + advance > width) { line++; used = 0; }
    if (line > lines) finish(cursor);
    used += advance;
    cursor += character.length;
    if (character === '\n') { line++; used = 0; }
  }
  finish(text.length);
  return pages.length ? pages : [{ start: 0, end: 0, text: '' }];
}
