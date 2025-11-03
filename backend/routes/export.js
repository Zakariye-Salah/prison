// backend/routes/export.js
const express = require('express');
const router = express.Router();
const Criminal = require('../models/Criminal');
const PDFDocument = require('pdfkit');

function safeText(v){ return (v === undefined || v === null) ? '' : String(v); }
function trunc(v, n=40){ v = safeText(v); return v.length > n ? (v.slice(0,n-1) + '…') : v; }

router.get('/', async (req, res) => {
  try {
    const type = req.query.type || 'pdf';
    const q = (req.query.q || '').trim();
    const status = (req.query.status || '').trim();
    const committedType = (req.query.committedType || '').trim();
    const roomId = (req.query.roomId || '').trim();

    const query = { deletedAt: null };
    if (q) {
      query.$or = [
        { fullName: new RegExp(q, 'i') },
        { prisonId: new RegExp(q, 'i') },
        { nationalId: new RegExp(q, 'i') }
      ];
    }
    if (status) query.status = status;
    if (committedType) query.committedType = committedType;
    if (roomId) query.roomId = roomId;

    // fetch criminals and populate room & prison for readable names
    const criminals = await Criminal.find(query)
      .populate('roomId')
      .populate('prisonRef')
      .limit(1000)
      .sort({ createdAt: -1 });

    if (type === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      const now = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
      res.setHeader('Content-Disposition', `attachment; filename=criminals-export-${now}.pdf`);

      // create document in landscape for more horizontal space
      const doc = new PDFDocument({ margin: 28, size: 'A4', layout: 'landscape' });
      doc.pipe(res);

      // small helpers inside export scope
      function fmtNumber(n){
        try { return new Intl.NumberFormat().format(Number(n || 0)); } catch(e){ return String(n || 0); }
      }
      function fitTextToHeight(text, width, maxHeight, fontSize){
        // quick trim to fit height, append ellipsis if trimmed
        let t = safeText(text);
        if(!t) return '';
        // if already fits, return
        try {
          if (doc.heightOfString(t, { width, fontSize }) <= maxHeight) return t;
        } catch(e) { /* fallback to trimming below */ }

        // loop trimming characters until it fits
        while(doc.heightOfString(t, { width, fontSize }) > maxHeight && t.length > 0){
          t = t.slice(0, -1);
        }
        // if trimmed, add ellipsis (ensure it fits)
        if (safeText(text) !== t) {
          t = t.slice(0, Math.max(0, t.length - 2)) + '…';
          while(doc.heightOfString(t, { width, fontSize }) > maxHeight && t.length > 1){
            t = t.slice(0, -1);
          }
        }
        return t;
      }

      // Title & meta
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#071124').text('Maxaabiista', { align: 'center' });
      doc.moveDown(0.12);

      // attempt to derive room/prison names (if roomId filter used)
      let derivedRoomName = '';
      let derivedPrisonName = '';
      if (roomId) {
        if (criminals.length > 0) {
          derivedRoomName = (criminals[0].roomId && criminals[0].roomId.name) ? criminals[0].roomId.name : '';
          derivedPrisonName = (criminals[0].prisonRef && criminals[0].prisonRef.name) ? criminals[0].prisonRef.name : (criminals[0].prisonId || '');
        } else {
          derivedRoomName = `ID Qolka: ${roomId}`;
        }
      }

      const metaParts = [];
      if (q) metaParts.push(`q: ${q}`);
      if (status) metaParts.push(`Xaalada: ${status}`);
      if (committedType) metaParts.push(`Nuuca Danbi: ${committedType}`);
      if (roomId && derivedRoomName) metaParts.push(`Qolka: ${derivedRoomName}`);
      if (roomId && derivedPrisonName) metaParts.push(`Xabsiga: ${derivedPrisonName}`);
      metaParts.push('Taarikhda: ' + (new Date()).toLocaleString());
      doc.fontSize(9).font('Helvetica').fillColor('gray').text(metaParts.join(' • '), { align: 'center' });
      doc.moveDown(0.6);

      // compute content area
      const left = doc.page.margins.left;
      const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // small gap between columns
      const colGap = 8;

      // tuned column widths (sum + gaps should be <= contentWidth)
      // make Nuuca Danbi (type) same width as prisonId (ID Maxbuuska)
      const prisonIdWidth = 90;
      const nameWidth = Math.round(contentWidth * 0.18);
      const prisonWidth = Math.round(contentWidth * 0.17);
      const typeWidth = prisonIdWidth; // match ID column

      const cols = {
        no: 30,
        prisonId: prisonIdWidth,
        name: nameWidth,
        prison: prisonWidth,
        room: 70,
        status: 60,
        type: typeWidth,
        fine: 40,
        nid: Math.max(100, contentWidth - (30 + prisonIdWidth + nameWidth + prisonWidth + 40 + 60 + typeWidth + 70) - (colGap * 8))
      };

      // compute X positions programmatically and include colGap
      const positions = {};
      let offset = left;
      ['no','prisonId','name','prison','room','status','type','fine','nid'].forEach(k => {
        positions[k] = offset;
        offset += cols[k] + colGap;
      });

      // header row (compact)
      let y = doc.y;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#071124');
      doc.text('No#', positions.no, y, { width: cols.no });
      doc.text('ID Maxbuuska', positions.prisonId, y, { width: cols.prisonId });
      doc.text('Magaca oo buuxa', positions.name, y, { width: cols.name });
      doc.text('Xabsiga', positions.prison, y, { width: cols.prison });
      doc.text('Qolka', positions.room, y, { width: cols.room });
      doc.text('Xaalda', positions.status, y, { width: cols.status });
      doc.text('Nuuca Danbi', positions.type, y, { width: cols.type });
      doc.text('Ganaaxa', positions.fine, y, { width: cols.fine, align: 'right' });
      doc.text('NIRA', positions.nid, y, { width: cols.nid });

      doc.moveDown(0.35);
      y = doc.y;
      doc.moveTo(left, y).lineTo(left + contentWidth, y).strokeColor('#e6eefc').stroke();
      doc.moveDown(0.25);
      y = doc.y;

      // rows — dynamic multi-line support
      doc.fontSize(8).font('Helvetica').fillColor('#071124');
      const fontSize = 8;
      const maxLines = 3;
      const lineHeight = fontSize * 1.18; // approximate
      const minRowH = Math.max(14, Math.round(lineHeight)); // minimum row height

      // small padding map: less padding for type column
      const padMap = { default: 4, type: 2 };

      criminals.forEach((c, i) => {
        // prepare text for each cell and measure height when wrapped
        const prisonName = (c.prisonRef && c.prisonRef.name) ? c.prisonRef.name : safeText(c.prisonId);
        const roomName = (c.roomId && c.roomId.name) ? c.roomId.name : (c.roomId ? safeText(c.roomId) : '');
        const typeText = safeText(c.committedType) + (c.committedTypeOther ? ' • ' + c.committedTypeOther : '');
        const fineVal = (c.fineAmount || 0);

        // cell raw strings
        const cells = {
          no: String(i + 1),
          prisonId: safeText(c.prisonId),
          name: safeText(c.fullName),
          prison: safeText(prisonName),
          room: safeText(roomName),
          status: safeText(c.status),
          type: safeText(typeText),
          fine: (typeof fineVal === 'number' && !isNaN(fineVal)) ? `$${fmtNumber(fineVal)}` : safeText(fineVal),
          nid: safeText(c.nationalId)
        };

        // compute allowed width inside cell (account for small horizontal padding)
        const allowed = {};
        Object.keys(cols).forEach(k => {
          const padX = (k === 'type') ? padMap.type : padMap.default;
          allowed[k] = Math.max(16, cols[k] - padX * 2);
        });

        // compute maximum allowed height for a cell (maxLines)
        const maxCellHeight = Math.max(minRowH, Math.round(lineHeight * maxLines));

        // fit each cell to maxCellHeight by trimming if necessary
        const fitted = {};
        let maxNeeded = 0;
        Object.keys(cells).forEach(k => {
          const txt = cells[k] || '';
          // fit text to allowed[k] width and maxCellHeight
          const fit = fitTextToHeight(txt, allowed[k], maxCellHeight, fontSize) || '';
          fitted[k] = fit;
          const h = doc.heightOfString(fit || '', { width: allowed[k], fontSize });
          if (h > maxNeeded) maxNeeded = h;
        });
        const rowH = Math.max(minRowH, Math.ceil(maxNeeded) + 6); // extra vertical padding

        // new page when necessary
        if (y + rowH > doc.page.height - doc.page.margins.bottom - 28) {
          doc.addPage({ layout: 'landscape' });
          y = doc.y;
        }

        // alternating subtle background
        if (i % 2 === 0) {
          doc.save();
          doc.rect(left, y - 2, contentWidth, rowH + 4).fillOpacity(0.03).fill('#0b5ed7');
          doc.restore();
        }

        // draw each column cell text at precise x, y (use allowed width)
        Object.keys(fitted).forEach(k => {
          const padX = (k === 'type') ? padMap.type : padMap.default;
          const x = positions[k] + padX;
          const w = Math.max(10, cols[k] - padX * 2);

          // alignment for fine column's right alignment
          if (k === 'fine') {
            // right aligned inside fine column
            const textWidth = doc.widthOfString(fitted[k] || '', { fontSize });
            const rightX = positions.fine + cols.fine - padX - textWidth;
            doc.text(fitted[k] || '', rightX, y, { width: textWidth, fontSize, lineBreak: true });
          } else {
            doc.text(fitted[k] || '', x, y, { width: w, fontSize, lineBreak: true });
          }
        });

        // advance cursor
        y += rowH;
        doc.y = y;
      });

      // footer: bottom-right, single-line (Somali)
      const footerText = `Waxaad Degsatay Diwaanka ${criminals.length} Maxbuus. Waxaa curiyay App-ka Diiwaanka Maxaabiista.`;
      const footerFontSize = 8;
      doc.fontSize(footerFontSize).font('Helvetica').fillColor('gray');
      const textWidth = doc.widthOfString(footerText);
      const xPos = doc.page.width - doc.page.margins.right - textWidth;
      const yPos = doc.page.height - doc.page.margins.bottom - 18;
      doc.text(footerText, xPos, yPos, { lineBreak: false });

      doc.end();
      return;
    }

    // non-pdf json response fallback
    res.json({ criminals });
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

module.exports = router;
