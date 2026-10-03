// Identity preferences are independent of progress/cloud snapshots. Numeric IDs
// remain compatible with existing leaderboard entries.
export const avatarNames=['Azure','Sunny','Berry','Mint','Cosmo','Coral','Frost','Royal'];
const KEY='marble-sort-player-identity-v1';
let revision=0;
function clean(value){const out={};if(Number.isInteger(value?.avatar)&&value.avatar>=0&&value.avatar<8)out.avatar=value.avatar;if(typeof value?.playerName==='string')out.playerName=value.playerName.slice(0,18);return out;}
function read(){try{return clean(JSON.parse(localStorage.getItem(KEY)||'{}'));}catch{return {};}}
function native(){const cap=globalThis.Capacitor;return cap?.isNativePlatform?.()&&cap?.isPluginAvailable?.('PlayerProfile')?cap.registerPlugin('PlayerProfile'):null;}
export function applyIdentity(profile){return Object.assign(profile,read());}
export function saveIdentity(profile){const value=clean(profile);revision++;localStorage.setItem(KEY,JSON.stringify(value));const plugin=native();if(plugin)plugin.set({value:JSON.stringify(value)}).catch(()=>{});return value;}
export async function restoreIdentity(profile){const before=revision;const plugin=native();let value=read();if(plugin){try{const result=await plugin.get();if(result.value)value=clean(JSON.parse(result.value));}catch{}}
 if(revision!==before)return applyIdentity(profile);
 Object.assign(profile,value);saveIdentity(profile);return profile;
}
export function avatarImage(id,alt=''){const index=Number.isInteger(Number(id))&&Number(id)>=0&&Number(id)<8?Number(id):0;return `<img class="player-avatar-art" src="/assets/avatar-${index}.svg" alt="${alt}" />`;}
export function renderPlayerMenu({profile,name,editing,id,version,escape,icon,terms,privacy}){
 const selected=Number(profile.avatar)||0;
 return `<div class="modal-backdrop"><div class="popup profile-menu" role="dialog" aria-modal="true" aria-label="Player menu">
 <header class="profile-menu-header"><span>YOUR PLAYER</span><button class="popup-close" data-action="close-modal" aria-label="Close menu"></button></header>
 <div class="popup-body profile-menu-body"><section class="profile-card">${avatarImage(selected)}<div><small>MARBLE SORT</small><div class="profile-name">${editing?`<input class="menu-name-input" maxlength="18" value="${escape(name)}" aria-label="Player name" />`:`<strong>${escape(name)}</strong>`}<button class="profile-edit" data-action="menu-edit-name" aria-label="${editing?'Save player name':'Edit player name'}">${editing?'✓':icon('pencil')}</button></div><span class="profile-level">LEVEL ${profile.level}</span></div></section>
 <section class="profile-avatars"><div class="profile-section-title"><h3>Choose your marble</h3><span class="profile-saved" role="status">Saved automatically</span></div><div class="profile-avatar-grid">${avatarNames.map((label,index)=>`<button class="profile-avatar-choice ${index===selected?'is-selected':''}" data-action="menu-avatar-choice" data-avatar="${index}" aria-pressed="${index===selected}" aria-label="Choose ${label} avatar">${avatarImage(index)}<span>${label}</span>${index===selected?'<b aria-hidden="true">✓</b>':''}</button>`).join('')}</div></section>
 <button class="profile-support" data-action="support">${icon('headset')}<span>Need a hand?<small>Contact player support</small></span><b aria-hidden="true">›</b></button>
 <div class="profile-legal"><button data-action="legal-online" data-url="${terms}">Terms</button><button data-action="legal-online" data-url="${privacy}">Privacy</button><button data-action="menu-doc" data-doc="deletion">Account deletion</button></div>
 <footer class="profile-footer"><div><small>PLAYER ID</small><span title="${escape(id)}">${escape(id.slice(0,8))}…${escape(id.slice(-4))}</span><button data-action="copy-player-id" aria-label="Copy Player ID">${icon('copy')}</button></div><span>v${escape(version)}</span></footer>
 </div></div></div>`;
}
