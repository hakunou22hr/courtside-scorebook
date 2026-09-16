(() => {
  const page=document.getElementById('sheetPrintArea');
  if(!page) return;
  const layer=document.createElement('div');
  layer.className='sheet-static-overlay';
  Object.assign(layer.style,{position:'absolute',inset:'0',pointerEvents:'none',fontFamily:'Arial, sans-serif',color:'#111'});
  let html='';
  const tag=(txt,x,y,size=8)=>`<span style="position:absolute;left:${x}%;top:${y}%;font-size:${size}px;transform:translate(-50%,-50%)">${txt}</span>`;
  for(let i=0;i<18;i++){
    html+=tag(i+1,5.8,22.45+i*1.31,7);
    html+=tag(i+1,5.8,58.85+i*1.31,7);
  }
  for(let n=1;n<=160;n++){
    const block=Math.floor((n-1)/40), row=(n-1)%40;
    const x=[56.0,67.25,78.5,89.75][block];
    const y=16.18+row*1.378;
    html+=tag(n,x,y,6.6);
  }
  layer.innerHTML=html;
  page.appendChild(layer);
})();
