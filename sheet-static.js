(() => {
  const page=document.getElementById('sheetPrintArea');
  const image=document.getElementById('sheetImage');
  const overlay=document.getElementById('sheetOverlay');
  if(!page||!image||!overlay) return;

  // Use the exact JPG uploaded by the user as the visible score sheet.
  image.src='assets/スコアシート.jpg';
  image.alt='公式スコアシート';

  // The JPG already contains row numbers and running-score numbers, so remove
  // any older helper layer if a cached build created one.
  page.querySelectorAll('.sheet-static-overlay').forEach(el=>el.remove());

  const runXMap=[
    [55.4,51.21], [57.9,59.76],
    [66.5,62.74], [69.0,71.21],
    [78.0,74.19], [80.5,82.66],
    [89.1,85.65], [91.6,94.19]
  ];

  function nearestMappedX(x){
    let best=runXMap[0];
    for(const pair of runXMap){
      if(Math.abs(pair[0]-x)<Math.abs(best[0]-x)) best=pair;
    }
    return best[1];
  }

  function adjustOverlay(){
    page.querySelectorAll('.sheet-static-overlay').forEach(el=>el.remove());

    overlay.querySelectorAll('.runmark').forEach(el=>{
      const oldX=parseFloat(el.style.left)||0;
      const oldY=parseFloat(el.style.top)||0;
      const row=Math.max(0,Math.min(39,Math.round((oldY-14.8)/1.43)));
      el.style.left=`${nearestMappedX(oldX)}%`;
      el.style.top=`${15.365+row*1.4115}%`;
      el.style.transform='translate(-50%,-50%)';
    });

    overlay.querySelectorAll('.foulmark').forEach(el=>{
      el.style.transform='translate(-50%,-50%)';
    });
  }

  const observer=new MutationObserver(adjustOverlay);
  observer.observe(overlay,{childList:true,subtree:true});
  image.addEventListener('load',adjustOverlay);
  adjustOverlay();
})();
