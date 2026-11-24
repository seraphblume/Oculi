// Renders one ZL Retina view off the main thread. Inputs and outputs are plain numbers;
// nothing leaves the device.
importScripts("zl-retina.js");

self.onmessage = event => {
  const { id, vectors, opts, image, tailEnergy } = event.data;
  try {
    // Past the sampling budget, show the most defocus the budget allows and say so.
    let scale = 1, psf = null;
    for (let attempt = 0; attempt < 6 && !psf; attempt++) {
      try {
        psf = self.ZLRetina.retinalPsf({}, { ...opts, vectors: { m: vectors.m * scale, j0: vectors.j0 * scale, j45: vectors.j45 * scale } });
      } catch (error) {
        if (!/Nyquist|4097/.test(error.message)) throw error;
        scale *= 0.8;
      }
    }
    if (!psf) throw new RangeError("Beyond the demo's range");
    const out = self.ZLRetina.simulateRetina(image, self.ZLRetina.cropPsf(psf, tailEnergy));
    self.postMessage({ id, out, scale }, [out.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
