import type { WeaponId } from './weapons';
import { STARTERS, armamentOf } from './arsenal';
import type { VariantId } from './arsenal';
export const INK = '#201b32';
export type Sprite = { rows: string[]; colors: Record<string,string> };
const heroRows = ['.......xx.......','......xhhx......','.....xhhhhx.....','....xhhHhhhx....','...xhhHhhhhhx...','..xxxxxxxxxxxx..','...xsssssSSx....','...xsxsxsSSx....','...xssssssSx....','....xsssSxx.....','...xcccccccxx...','..xccccHcccxax..','.xaxcccHcccxax..','..xxcccccccxx...','...xcccCcccx....','...xcccCcccx....','..xccCCCCCccx...','..xxxxxxxxxxx...','...xbbx.xbbx....','...xxxx.xxxx....'];
export function heroSprite(id: WeaponId): Sprite {
  const palettes: Record<WeaponId,[string,string,string]> = { pistol:['#9b684e','#d5a668','#ad705c'],machine:['#4b8591','#9ed3c3','#546b8f'],rocket:['#a86550','#e1b56d','#a36a54'],wand:['#766090','#b99ddd','#685181'],broom:['#657e65','#c5ce86','#8c6b79'] };
  const [hat,light,robe]=palettes[id]; const rows=[...heroRows];
  if(id==='pistol'){rows[0]='................';rows[1]='.....xxxxxx.....';rows[2]='....xhhhhhhx....';rows[3]='....xhhHhhhx....';rows[4]='...xxhhhhhhxx...';}
  if(id==='machine'){rows[0]='................';rows[1]='....xxxxxxx.....';rows[2]='...xhhhhhhhxx...';rows[3]='...xhhHhhhhhx...';rows[4]='...xHxxHxxHhx...';}
  if(id==='rocket'){rows[0]='................';rows[1]='.....xxxxxx.....';rows[2]='....xhhhhhhx....';rows[3]='...xhhHhhhhhx...';rows[4]='...xhhHhhhhhx...';}
  return {rows,colors:{x:INK,h:hat,H:light,s:'#f1d2ab',S:'#d4a68b',c:robe,C:hat,a:'#ebc69c',b:'#5b4855'}};
}
export const WEAPON_SPRITES: Record<WeaponId,Sprite> = {
  pistol:{rows:['.................','...xxxxxxxxxxx...','..xGGGGGGGGGGGx..','..xGHHHHGGGxxx...','..xGGGGGGGGx.....','...xxxxGGxx......','......xBBx.......','......xBBx.......','......xxxx.......'],colors:{x:INK,G:'#c39c71',H:'#f4d99c',B:'#735a79'}},
  machine:{rows:['......xxxxx..........','..xxxxxHHHxxxxxxxxxx.','.xGGGGGGGGGGGMMMMMMMx','.xGHHHHHGGGGGxMxMxMx.','.xGGGGGGGGGGGMMMMMMMx','..xxxxGGxxxGxxxxxxxx.','.....xBBx.xGx........','.....xBBx.xGx........','.....xxxx.xxx........'],colors:{x:INK,G:'#699d9a',H:'#b6debd',B:'#665578',M:'#b2a4bd'}},
  rocket:{rows:['..xxxxxxxxxxxxxxxx...','.xBBGGGGGGGGGGGMMMx..','xBBBGHHHHGGGGGGMMDDx.','xBBBGGGGGHGGGGGMMDDx.','xBBBGGGGHHGGGGGMMDDx.','.xBBGGGGGGGGGGGMMMx..','..xxxxxxxGGxxxxxxxx..','........xGGx.........','........xxxx.........'],colors:{x:INK,B:'#bf9863',G:'#b66e64',H:'#f3d491',M:'#937aaf',D:'#473d61'}},
  wand:{rows:['..................','............x...x.','...........xMx.xMx','............xMMMx.','..xxxxxxxxxxxHLHMx','.xGGGGGGGGGGxMLHMx','..xxxxxxxxxxxMMMx.','.............xxx..'],colors:{x:INK,M:'#a586c9',H:'#ead3a3',L:'#ecf4ce',G:'#8a6a8d'}},
  broom:{rows:['.............xx....','............xHHx...','..xxxxxxxxxxxHHHx..','.xGGGGGGGGGGMHHHHx.','..xxxxxxxxxxxHHHx..','............xHHx...','.............xx....'],colors:{x:INK,H:'#d8c88e',G:'#896c96',M:'#b47a8e'}},
};
export const SLIME: Sprite = {rows:['......xxxx......','....xxHHHHxx....','...xHGGGGGGGx...','..xHGGGGGGGGGx..','.xHGGGGGGGGGGGx.','.xGWWGGGGWWGGGx.','.xGxWGGGGxWGGGx.','.xGGGGxxGGGGGGx.','..xGGGGGGGGGGx..','...xxxxxxxxxx...'],colors:{x:INK,H:'#b8df9b',G:'#6baf8b',W:'#fff0c9'}};
const VARIANT_ROWS: Partial<Record<VariantId,string[]>> = {
  scatter:['.............xxx.....','...xxxxxxxxxxHHHx....','..xGGGGGGGGGGHHHHx...','..xGHHHGGGGGGHHHx....','...xxxGGGxxxxxxxx....','.....xBBBx...........','.....xxxxx...........'],
  rail:['........xx...............','.......xHHx..............','..xxxxxxGGxxxxxxxxxxxxxx.','.xGGGGGGGGGGGHHHHHHHHHHHx','..xxxxGGxxxxxxxxxxxxxxxx.','.....xBBx................','.....xxxx................'],
  burst:['.....xxxxxxx.........','....xHHHHHHHx........','..xxxGGGGGGGxxxxxxxx.','.xGGGGGGGGGGHHHHHHHHx','..xxxxGGGGGxxxxxxxxx.','.....xBBx............','.....xxxx............'],
  prism:['...........xx........','..........xHHx.......','...xxxxxxxxHHxxxxxx..','..xGGGGGGGGHHGGGGHHx.','.xGHHHHGGGGHHGGGHHHHx','..xGGGGGGGGHHGGGGHHx.','...xxxxGGxxHHxxxxxx..','......xBBx.xx........','......xxxx...........'],
  mortar:['..........xxx........','.........xHHHx.......','........xGGGHx.......','.......xGGGGx........','......xGGGGx.........','.....xGGGGx..........','....xxGGGxx..........','...xBBBBBBBx.........','..xxxxxxxxxxx........'],
  mine:['.......xxxxxx........','......xHHHHHHx.......','...xxxGGGGGGGGxxx....','..xGGGGGGHHGGGGGGx...','.xGGGHHHHHHHHGGGGGx..','..xGGGGGGHHGGGGGGx...','...xxxxxxxxxxxxxx....'],
  frostfan:['...........x...x.....','..........xHx.xHx....','.........xHHHxHHHx...','..........xHHHHHx....','..xxxxxxxxxHHHHx.....','.xGGGGGGGGGGHHHHx....','..xxxxxxxxxHHHHHx....','..........xHHHxHHx...','...........xxx.xxx...'],
  moon:['......xxxxxxxxxx.....','.....xHHHHHHHHHHx....','....xHGGGGGGGGGGHx...','....xHGGGHHHGGGGHx...','....xHGGHHGGGGGGHx...','....xHGGGHHHGGGGHx...','....xHGGGGGGGGGGHx...','.....xHHHHHHHHHHx....','......xxxxxxxxxx.....'],
  lance:['..................x......','.................xHx.....','..xxxxxxxxxxxxxxxxHHx....','.xGGGGGGGGGGGGGMMMMHHHHx..','..xxxxxxxxxxxxxxxxHHx....','.................xHx.....','..................x......'],
  flying:['...........xx........','..........xHHx.......','.........xHHHx.......','..xxxxxxxxHHHHxxxxxx.','.xGGGGGGGGHHHHGGGGGGx','..xxxxxxxxHHHHxxxxxx.','.........xHHHx.......','..........xHHx.......','...........xx........'],
};
export function variantSprite(family:WeaponId,variant:VariantId=STARTERS[family]):Sprite {
  const rows=VARIANT_ROWS[variant];
  return rows?{rows,colors:{x:INK,G:armamentOf(variant).color,H:'#f4dfb2',B:'#765b80',M:'#ad91bd'}}:WEAPON_SPRITES[family];
}
