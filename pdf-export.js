'use strict';
// The source remains a separate, unmodified attachment in IndexedDB.
function projectFromFilename(name){
 return String(name).replace(/\.pdf$/i,'').replace(/^\d{6}[\s_-]+/,'').trim();
}
function pdfText(value){return String(value||'–').replace(/\t/g,'    ').replace(/\r\n?/g,'\n')}
function wrappedLines(text,font,size,width){
 const lines=[];
 for(const paragraph of pdfText(text).split('\n')){
  if(!paragraph){lines.push('');continue}
  let line='';
  for(const word of paragraph.split(/\s+/)){
   if(font.widthOfTextAtSize(word,size)>width){
    if(line){lines.push(line);line=''}
    for(const char of word){if(font.widthOfTextAtSize(line+char,size)>width){lines.push(line);line=''}line+=char}
   }else if(line&&font.widthOfTextAtSize(line+' '+word,size)>width){lines.push(line);line=word}
   else line+=(line?' ':'')+word;
  }
  if(line)lines.push(line);
 }
 return lines;
}
async function buildCombinedPdf(data){
 const {PDFDocument,StandardFonts,rgb}=PDFLib;
 const pdf=await PDFDocument.load(data.sourcePdf.data),originalCount=pdf.getPageCount();
 const font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const left=50,width=495.28,ink=rgb(.17,.18,.19),muted=rgb(.38,.39,.4);
 const headerResponse=await fetch('./assets/briefkopf.png');if(!headerResponse.ok)throw new Error('Briefkopf nicht verfügbar. Bitte App einmal online vollständig laden.');
 const logo=await pdf.embedPng(await headerResponse.arrayBuffer());
 const reports=data.reports||[data],total=originalCount+reports.length;
 const confirmation=data.confirmation||reports[reports.length-1];
 for(const [index,reportData] of reports.entries()){
 const data=reportData,page=pdf.addPage([595.28,841.89]);
 page.drawImage(logo,{x:36,y:651,width:523,height:523*logo.height/logo.width});
 function draw(value,x,y,{size=10,strong=false,maxWidth=width,maxLines=1}={}){
  const face=strong?bold:font,lines=wrappedLines(value,face,size,maxWidth);
  if(lines.length>maxLines)throw new Error('Eine Angabe ist zu lang für die Abschlussseite. Bitte kürzen: '+pdfText(value).slice(0,45));
  for(const line of lines){if(line)page.drawText(line,{x,y,size,font:face,color:ink});y-=size*1.35}
  return y;
 }
 let y=draw('Lieferschein '+(data.deliveryNumber||'–'),left,624,{size:11});
 y=draw(data.project,left,y-7,{size:10,maxLines:2});
 y=draw('Arbeitsnachweis - '+formatReportDay(data.day),left,y-18,{size:14,strong:true});
 y=draw('Arbeitsbericht:',left,y-10,{size:11});
 const available=y-452;let size=11,lines;
 for(;size>=8;size-=.5){lines=wrappedLines(data.report,font,size,width);if(lines.length*size*1.35<=available)break}
 if(size<8)throw new Error('Der Bericht ist zu lang für eine einzelne Abschlussseite. Bitte den Text kürzen.');
 for(const line of lines){if(line)page.drawText(line,{x:left,y,size,font,color:ink});y-=size*1.35}
 const c=data.customer||{};
 draw('Mitarbeiter:',left,432,{size:11});
 draw('Vorarbeiter:',left,411);draw(c.foreman,left+110,411,{maxWidth:385,maxLines:1});
 draw('Facharbeiter:',left,392);draw(c.worker,left+110,392,{maxWidth:385,maxLines:1});
 draw('Strahlmittel',left,363,{size:11});
 draw('Art:',left+20,344);draw(c.abrasive==='Sonstiges'?c.abrasiveOther:c.abrasive,left+110,344,{maxWidth:385});
 draw('Menge:',left,325);draw((c.baseQuantity?'Grundmenge':'')+(c.abrasiveKg?(c.baseQuantity?' / ':'')+c.abrasiveKg+' kg':''),left+110,325,{maxWidth:385});
 draw('Einstellung:',left,296);draw('Air: '+(c.airSetting||'–')+'     Media: '+(c.mediaSetting||'–'),left+110,296,{maxWidth:385});
 draw('Düse:',left,277);draw(c.nozzle,left+110,277,{maxWidth:385});
 if(index===reports.length-1){
 const finalCustomer=confirmation.customer||{};
 draw('Abschlussbestätigung zum gesamten Auftrag',left,246,{size:10,strong:true});
 draw('Die Arbeiten aus allen beigefügten Tagesberichten wurden ordnungsgemäß durchgeführt.',left,231,{size:9});
 draw('Name:',left+110,210);draw(finalCustomer.signerName,left+180,210,{maxWidth:315});
 draw('Datum:',left+110,190);draw(finalCustomer.signedDay||confirmation.day,left+180,190,{maxWidth:315});
 draw('Unterschrift und Stempel:',left,173,{size:10});
 if(confirmation.signature){const signature=await pdf.embedPng(confirmation.signature),scale=Math.min(335/signature.width,70/signature.height);
 page.drawImage(signature,{x:left+155,y:99,width:signature.width*scale,height:signature.height*scale});}
 page.drawLine({start:{x:left+155,y:98},end:{x:left+width,y:98},thickness:.5,color:muted});
 }else{
 draw('Fortsetzung des Arbeitsnachweises.',left,246,{size:10});
 draw('Die gemeinsame Abschlussbestätigung folgt auf der letzten Berichtsseite.',left,230,{size:9});
 }
 draw('Vielen Dank für Ihren Auftrag.',left,80,{size:10});
 draw('Gerne stehen Ihnen Herr Lüke und sein Team für Rückfragen zur Verfügung.',left,65,{size:9});
 const footer='LST Lüke-Strahl-Technik GmbH | Am Hinkelstein 53a | 64665 Alsbach-Hähnlein';
 draw(footer,left,39,{size:7,maxWidth:495});
 draw('Tel.: 06251 826 33 00 | post@lueke-strahlt.de | www.lueke-strahlt.de',left,28,{size:7});
 draw('Seite '+(originalCount+index+1)+' / '+total,left+420,16,{size:7,maxWidth:75});
 }
 return pdf.save();
}

function formatReportDay(day){return /^\d{4}-\d{2}-\d{2}$/.test(day||'')?day.slice(8,10)+'.'+day.slice(5,7)+'.'+day.slice(0,4):(day||'Datum fehlt')}
