let currentQR = null;

function setQR(qr) {
  currentQR = qr;
}

function getQR() {
  return currentQR;
}

module.exports = { setQR, getQR };