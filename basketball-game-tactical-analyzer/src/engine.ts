import type { CoachAdvice, Phase, TacticalFinding, TagKind } from './types';

const messages:Record<Phase,Record<TagKind,{finding:string;evidence:string;recommendation:string}>>={
 '全体':{GOOD:{finding:'ボールと人が止まらず、良い流れです',evidence:'連続した判断で守備を動かせています',recommendation:'同じテンポを継続'},CHECK:{finding:'攻守の切り替えを確認',evidence:'戻りと走り出しにばらつきがあります',recommendation:'全員で最初の3歩を速く'},FIX:{finding:'プレーの目的が揃っていません',evidence:'ボール保持が長くなっています',recommendation:'早い声かけで狙いを共有'}},
 'オフェンス':{GOOD:{finding:'ペイントタッチから良い展開',evidence:'守備を収縮させ、外のスペースを作れています',recommendation:'キックアウト後のエクストラパスまで継続'},CHECK:{finding:'スペーシングを確認',evidence:'ペイント周辺に味方が重なっています',recommendation:'コーナーを埋めてドライブレーンを確保'},FIX:{finding:'最初のパスで攻撃が停滞',evidence:'守備が動く前のタフショットが増えています',recommendation:'ペイントタッチを1回作ってから判断'}},
 'ディフェンス':{GOOD:{finding:'ヘルプと次のローテーションが連動',evidence:'ドライブ後も逆サイドまで対応できました',recommendation:'1線の方向づけを継続'},CHECK:{finding:'2線の位置を確認',evidence:'ボールとマークを同時に見にくい位置です',recommendation:'一歩リング側で両方を視野に入れる'},FIX:{finding:'中央へのドライブを許しています',evidence:'1線の方向づけと3線ヘルプが遅れています',recommendation:'中央を切り、3線は一歩早く準備'}},
 'ブレイク':{GOOD:{finding:'ワイドレーンとリムランが機能',evidence:'数的優位を作れています',recommendation:'アウトレットから同じ走路を継続'},CHECK:{finding:'トレーラーの参加を確認',evidence:'速攻後の次の攻撃が止まっています',recommendation:'ドラッグスクリーンへ早く移行'},FIX:{finding:'ボールだけが先行しています',evidence:'両ウイングの走り出しが遅れています',recommendation:'リバウンドと同時に3レーンを作る'}},
 'プレスダウン':{GOOD:{finding:'中央フラッシュでプレスを解除',evidence:'斜めパスから逆サイドへ運べています',recommendation:'中央と逆サイドを継続して使う'},CHECK:{finding:'第2レシーバーの位置を確認',evidence:'ボール保持者の逃げ道が少ないです',recommendation:'中央へフラッシュしてバックパスを確保'},FIX:{finding:'同じサイドへ追い込まれています',evidence:'コーナーでダブルチームを受けています',recommendation:'縦だけでなく中央への斜めパスを優先'}},
 'リバウンド':{GOOD:{finding:'先に身体を当てられています',evidence:'相手を止めてからボールへ向かえました',recommendation:'ヒット・ターン・ゲットを継続'},CHECK:{finding:'ボックスアウトの相手を確認',evidence:'シュート時にボールだけを見ています',recommendation:'先にマークを見つけて身体を当てる'},FIX:{finding:'セカンドショットを許しています',evidence:'リングとの間を取られています',recommendation:'全員が相手を止めてからリバウンドへ'}},
 'トランジション':{GOOD:{finding:'切り替えの最初の3歩が速い',evidence:'ボールより先にリングを守れています',recommendation:'声でマッチアップを受け渡す'},CHECK:{finding:'ボールストップを確認',evidence:'戻っているが役割が曖昧です',recommendation:'1人はボール、残りはリングとシューター'},FIX:{finding:'戻りが遅く数的不利です',evidence:'シュート後に止まる選手がいます',recommendation:'打った瞬間にセーフティ2人を確保'}}
};
export function suggestion(phase:Phase,kind:TagKind){return messages[phase][kind]}
export function makeAdvice(items:TacticalFinding[]):CoachAdvice{
 const recent=[...items].sort((a,b)=>b.timestamp-a.timestamp).slice(0,8);
 const good=recent.find(x=>x.kind==='GOOD'); const fix=recent.find(x=>x.kind==='FIX')??recent.find(x=>x.kind==='CHECK');
 const repeated=recent.filter(x=>x.kind==='GOOD'&&x.phase===good?.phase).length>=2;
 return {situation:fix?.finding??good?.finding??'直近のプレーを観察中です。タグを追加してください。',positive:good?`${good.finding}。${repeated?'繰り返し機能しています。':''}`:'良い形を見つけたらGOOD PLAYで残しましょう。',fix:fix?`${fix.evidence}。ただし断定せず、次のプレーでも確認します。`:'大きな修正はありません。良い判断を続けましょう。',nextThree:fix?.recommendation??good?.recommendation??'攻守の切り替えと声かけを揃える',generatedAt:new Date().toISOString()};
}
