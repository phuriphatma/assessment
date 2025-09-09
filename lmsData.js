// Minimal LMS demo data (z-score calculation) -- extend with full tables
// Structure: lmsData[metric][sex] = [{x: ageMonths or stature cm, L, M, S}, ...]
// Only a few sample points provided; interpolation will be linear for demo.

const lmsData = {
  weightForAge: {
    boys: [
      { x: 0, L: -0.3053, M: 3.3464, S: 0.14602 },
      { x: 12, L: -0.0501, M: 9.626, S: 0.11135 },
      { x: 24, L: 0.0903, M: 12.227, S: 0.10956 },
      { x: 36, L: 0.3809, M: 14.3256, S: 0.10826 },
      { x: 48, L: 0.5218, M: 16.003, S: 0.1069 }
    ],
    girls: [
      { x: 0, L: -0.3833, M: 3.2322, S: 0.14171 },
      { x: 12, L: -0.1118, M: 8.9477, S: 0.11316 },
      { x: 24, L: 0.0843, M: 11.5718, S: 0.1108 },
      { x: 36, L: 0.2297, M: 13.9003, S: 0.1094 },
      { x: 48, L: 0.3149, M: 15.702, S: 0.1083 }
    ]
  },
  statureForAge: {
    boys: [
      { x: 0, L: 1, M: 49.9889, S: 0.03795 },
      { x: 12, L: 1, M: 75.687, S: 0.0321 },
      { x: 24, L: 1, M: 87.1525, S: 0.03134 },
      { x: 36, L: 1, M: 95.1641, S: 0.03115 },
      { x: 48, L: 1, M: 101.6042, S: 0.03119 }
    ],
    girls: [
      { x: 0, L: 1, M: 49.2864, S: 0.0379 },
      { x: 12, L: 1, M: 74.0831, S: 0.03227 },
      { x: 24, L: 1, M: 85.713, S: 0.03167 },
      { x: 36, L: 1, M: 94.2136, S: 0.03199 },
      { x: 48, L: 1, M: 100.9977, S: 0.0324 }
    ]
  },
  headCircumference: {
    boys: [
      { x: 0, L: 1, M: 34.4618, S: 0.03686 },
      { x: 12, L: 1, M: 46.0221, S: 0.02431 },
      { x: 24, L: 1, M: 48.255, S: 0.02328 },
      { x: 36, L: 1, M: 49.4742, S: 0.02295 }
    ],
    girls: [
      { x: 0, L: 1, M: 33.8787, S: 0.03496 },
      { x: 12, L: 1, M: 44.7997, S: 0.02409 },
      { x: 24, L: 1, M: 47.0745, S: 0.02362 },
      { x: 36, L: 1, M: 48.2732, S: 0.02342 }
    ]
  },
  weightForStature: {
    boys: [
      // x is stature cm; sample sparse
      { x: 65, L: -0.3521, M: 7.4327, S: 0.08217 },
      { x: 75, L: -0.3521, M: 9.4831, S: 0.08217 },
      { x: 85, L: -0.3521, M: 11.3172, S: 0.08217 },
      { x: 95, L: -0.3521, M: 13.611, S: 0.08217 }
    ],
    girls: [
      { x: 65, L: -0.3833, M: 7.1264, S: 0.081 },
      { x: 75, L: -0.3833, M: 9.1385, S: 0.081 },
      { x: 85, L: -0.3833, M: 10.9773, S: 0.081 },
      { x: 95, L: -0.3833, M: 13.3197, S: 0.081 }
    ]
  }
};

function interpolateLMS(arr, x){
  if(!arr || !arr.length) return null;
  if(x <= arr[0].x) return arr[0];
  if(x >= arr[arr.length-1].x) return arr[arr.length-1];
  for(let i=0;i<arr.length-1;i++){
    const a = arr[i], b = arr[i+1];
    if(x >= a.x && x <= b.x){
      const t = (x - a.x)/(b.x - a.x);
      return {
        x,
        L: a.L + t*(b.L - a.L),
        M: a.M + t*(b.M - a.M),
        S: a.S + t*(b.S - a.S)
      };
    }
  }
  return null;
}

function lmsZ(L,M,S,value){
  if(L === 0) return Math.log(value/M)/S;
  return (Math.pow(value/M, L) - 1)/(L*S);
}

function zToPercentile(z){
  // Approximate normal CDF
  const p = 0.5*(1+erf(z/Math.SQRT2));
  return p*100;
}

function erf(x){
  // Abramowitz-Stegun approximation
  const sign = x<0?-1:1; x = Math.abs(x);
  const a1= 0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const t = 1/(1+p*x);
  const y = 1 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);
  return sign*y;
}

function computeZ(metric, sex, x, value){
  const arr = lmsData[metric]?.[sex];
  if(!arr) return { z: null, percentile: null };
  const lms = interpolateLMS(arr, x);
  if(!lms) return { z: null, percentile: null };
  const z = lmsZ(lms.L, lms.M, lms.S, value);
  const percentile = zToPercentile(z);
  return { z, percentile };
}

window.GrowthLMS = { computeZ };
