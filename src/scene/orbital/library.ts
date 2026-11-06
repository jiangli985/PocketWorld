import type { BookContent } from '../../types/world';

export const PRESET_BOOKS: BookContent[] = [
  { id: 'book-01', title: '轨道上的日常', author: 'PocketWorld', pages: [
    '晨光越过窗沿，落在没有合上的书页上。\n\n在这座缓缓旋转的居住舱里，遥远的地球也成为了日常的一部分。',
    '窗外的星星没有闪烁。\n\n我们看到的光，已经走过了漫长的旅程。此刻，刚好抵达。',
    '给植物浇水，听完一张唱片，然后写下今天想记住的事情。\n\n再远的地方，也可以有自己的生活。',
  ] },
  { id: 'book-02', title: '窗边的星图', author: 'PocketWorld', pages: [
    '在窗边放一张纸，记下今晚看到的第一颗星。\n\n不用急着知道它的名字，先记住它出现的方向。',
    '等房间里的灯暗下来，再向外看。\n\n那些看似不动的光点，也在宇宙里慢慢移动。',
  ] },
  { id: 'book-03', title: '一封写给地球的信', author: 'PocketWorld', pages: [
    '亲爱的地球：\n\n今天我又从舷窗看见了你的云。它们像一封还没有写完的信，绕着海岸缓缓展开。',
    '这里的夜很安静。等我回去，想和你一起走一条有树荫的路。\n\n先把这个愿望夹在书页里。',
  ] },
];

const STORAGE_KEY = 'pocketworld:library:books';

export function loadLocalBooks(): BookContent[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((book): book is BookContent =>
      book !== null && typeof book === 'object' &&
      typeof book.id === 'string' && book.id.startsWith('visitor-') &&
      typeof book.title === 'string' && book.title.length <= 80 &&
      (book.author === undefined || typeof book.author === 'string' && book.author.length <= 60) &&
      Array.isArray(book.pages) && book.pages.length > 0 &&
      book.pages.every((page: unknown) => typeof page === 'string') &&
      book.pages.join('').length <= 10000
    ).slice(0, 30);
  } catch { return []; }
}

export function storeLocalBooks(books: BookContent[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}
