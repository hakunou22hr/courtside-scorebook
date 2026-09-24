export type TeamTone='dark'|'light';
export type Phase='全体'|'オフェンス'|'ディフェンス'|'ブレイク'|'プレスダウン'|'リバウンド'|'トランジション';
export type TagKind='GOOD'|'CHECK'|'FIX';
export type Confidence='高'|'中'|'低'|'判断困難';
export interface TacticalFinding {id:string;timestamp:number;quarter:string;team:TeamTone;phase:Phase;kind:TagKind;finding:string;evidence:string;confidence:Confidence;priority:number;recommendation:string;createdAt:string}
export interface CoachAdvice {situation:string;positive:string;fix:string;nextThree:string;generatedAt:string}
export interface VideoObservation {timestamp:number;note:string;confidence:Confidence}
export interface PlayerPosition {label:string;x:number;y:number;confidence:Confidence}
export interface Event {timestamp:number;type:string;actor?:string;detail:string}
export interface Possession {id:string;start:number;end?:number;team:TeamTone;phase:Phase;events:Event[]}
export interface Game {id:string;name:string;date:string;opponent:string;team:TeamTone;videoName?:string;findings:TacticalFinding[];advice?:CoachAdvice;updatedAt:string}
