function reject(message,status=409){throw Object.assign(new Error(message),{status});}

export function assertProjectSubmittable(bundle) {
  const incomplete=bundle.stages.filter(stage=>!stage.completion.done);
  if(incomplete.length)reject(`Incomplete stages: ${incomplete.map(stage=>stage.title).join(', ')}`);
  if(bundle.exceptions.some(item=>item.status==='pending'))reject('Unreviewed N/A exceptions remain');
  if(bundle.issues.some(item=>item.status!=='resolved'))reject('Open issues must be resolved by PM');
  if(bundle.issues.some(item=>['damage','quality'].includes(item.kind)&&!bundle.media.some(media=>media.issue_id===item.id)))reject('Damage / quality issue requires photographic evidence');
  if(!bundle.days.length||bundle.days.some(day=>day.status!=='approved'))reject('Every end-of-day report must be approved before closing');
  if(!bundle.confirmation)reject('Record signed client satisfaction or documented refusal');
  if(bundle.confirmation.outcome==='signed'&&!bundle.media.some(media=>media.category_key==='customer_signature'&&media.kind==='image'))reject('Upload a photo of the signed form');
}
