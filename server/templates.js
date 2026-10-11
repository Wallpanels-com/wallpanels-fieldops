/* Based on WallPanels installer checklist NEW and WP-TRAIN-03..06.
   Editable project templates are code-defined. A PM-approved exception handles truly N/A evidence. */
const media = (key, label, kind = 'image', required = true) => ({ key, label, kind, required });
const check = (key, label, required = true) => ({ key, label, required });
const installation = [
  { key:'preflight', title:'Before Departure', subtitle:'Everything ready before leaving?', icon:'clipboard-check',
    guide:'Verify the approved drawings, measurements, site and equipment. If anything is unclear, contact the Project Manager.',
    media:[], checks:[
      check('address_confirmed','Address confirmed with Project Manager'),
      check('approved_drawings','Approved drawings and dimensions reviewed'),
      check('scope_notes','Scope, notes and special instructions reviewed'),
      check('materials','Materials and hardware ready'),
      check('tools','Tools and hidden-utility detector ready'),
      check('protection_supplies','Floor paper and furniture protection film ready'),
      check('dress_code','Branded clean clothes, closed shoes and shoe covers'),
      check('phone_ready','Phone charged, storage available'),
      check('signage_ready','Company flags and signage ready')
    ] },
  { key:'before', title:'Arrival & Before', subtitle:'Record the original condition', icon:'camera',
    guide:'Set up the company signage on arrival. Capture all required views before any work begins, including existing damage.',
    media:[
      media('flags','Installed company flags / signage'), media('overview','Full room overview'),
      media('floor','Floors before work'), media('walls','Walls before work'),
      media('furniture','Furniture / other surfaces'), media('before_video','BEFORE video','video'),
      media('existing_damage','Existing damage (if any)','image',false)
    ], checks:[ check('address_matches','On-site address verified'), check('greeted_client','Greeted and introduced team'), check('shoe_covers','Shoe covers used before entering') ] },
  { key:'protection', title:'Site Protection', subtitle:'Protect the client’s property', icon:'shield-check',
    guide:'Protect floors, furniture and nearby surfaces. Only use your own work surfaces. Photograph the actual protection.',
    media:[media('protected_floor','Protected floor'),media('protected_furniture','Protected furniture / surfaces'),media('safe_work_zone','Protected work zone')],
    checks:[check('floor_covered','Floors covered'),check('furniture_covered','Furniture and finished surfaces protected'),check('no_client_furniture','Client furniture / countertops not used as workspace'),check('detector_used','Hidden-utility detector used before drilling')] },
  { key:'progress', title:'Installation Progress', subtitle:'Document the work in progress', icon:'wrench',
    guide:'Capture real progress and finished details as work advances. Document problems immediately and do not make unapproved changes.',
    media:[media('progress','Installation in progress')],
    checks:[check('protected_work','Work performed only in protected zone'),check('no_unapproved_changes','No unapproved design / material changes'),check('site_kept_tidy','Tools and work area kept tidy')] },
  { key:'installed', title:'After Installation', subtitle:'Before final cleanup', icon:'layers',
    guide:'Capture the completed installation from wide and close views before cleanup. Demonstrate operable components where applicable.',
    media:[media('finished_overview','Finished installation — wide view'),media('finished_product','Panels / cabinets / doors'),media('finished_details','Joints, edges and hardware'),media('after_video','AFTER video','video')],
    checks:[check('alignment','Alignment, joints and gaps verified'),check('secure','Secure mounting and no visible damage'),check('finish','Finish / paint / veneer inspected'),check('doors','Doors operate correctly',false),check('drawers','Drawers and soft-close operate correctly',false),check('lighting','Lighting / switches work',false)] },
  { key:'cleanup', title:'Cleanup & Final Photos', subtitle:'Leave the site clean and safe', icon:'sparkles',
    guide:'Show the cleanup result clearly. Remove debris, vacuum, remove protective film/paper, check safety and take final photos.',
    media:[media('pre_cleanup','Before cleanup'),media('post_cleanup','After cleanup — clean room'),media('final_overview','Final overview after cleanup')],
    checks:[check('debris_removed','Trash, packaging and offcuts removed'),check('vacuumed','Floors vacuumed / cleaned'),check('covering_removed','Protective paper / film removed'),check('tools_removed','Tools and flags collected'),check('no_hazards','No exposed screws, sharp edges or hazards')] },
  { key:'handover', title:'Quality & Handover', subtitle:'Client walkthrough and sign-off', icon:'badge-check',
    guide:'Perform self-inspection before presenting work. Walk through with the client, record punch-list items and client confirmation.',
    media:[media('customer_signature','Signed satisfaction form / client signature photo','image',false)],
    checks:[check('self_qc','Own end-to-end quality inspection completed'),check('walkthrough','Client walkthrough completed'),check('punchlist','Any punch-list items documented or resolved'),check('pm_notified','Project Manager informed')] }
];
const repair = structuredClone(installation);
repair[0].title = 'Repair Preparation';
repair[2].title = 'Site Protection';
repair[3].title = 'Repair In Progress';
repair[4].title = 'Repair Completed';
repair[4].media[1].label = 'Repaired area';
repair[4].media[2].label = 'Repair details / finishing';
export function stagesFor(type) { return structuredClone(type === 'repair' || type === 'punch_list' ? repair : installation); }
export const DAY_CHECKS = [
  {key:'tools_collected',label:'Tools and company flags collected'},
  {key:'site_tidy',label:'Trash removed and area left tidy'},
  {key:'no_hazards',label:'No exposed screws, unsafe sharp edges or hazards'},
  {key:'pm_updated',label:'Project Manager / client informed of daily status'}
];
export function stageComplete(stage, allMedia, allChecks, approvedExceptions = []) {
  const mediaOfStage = allMedia.filter(m => m.stage_id === stage.id);
  const checks = allChecks.filter(c => c.stage_id === stage.id);
  const missingMedia = (stage.media_requirements || []).filter(r => r.required && !mediaOfStage.some(m => m.category_key === r.key && m.kind === r.kind) &&
    !approvedExceptions.some(e => e.stage_id === stage.id && e.category_key === r.key && e.status === 'approved')).map(r=>r.label);
  const missingChecks = checks.filter(c => c.required && c.result_status !== 'done').map(c=>c.label);
  return { done:missingMedia.length === 0 && missingChecks.length === 0, missingMedia, missingChecks };
}
