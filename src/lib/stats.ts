/** Ordinary least-squares fit. Returns slope/intercept and Pearson r² for a set of (x, y) points. */
export function linearRegression(points: Array<{ x: number; y: number }>) {
	const n = points.length;
	if (n < 2) return null;

	let sx = 0,
		sy = 0,
		sxy = 0,
		sxx = 0,
		syy = 0;
	for (const { x, y } of points) {
		sx += x;
		sy += y;
		sxy += x * y;
		sxx += x * x;
		syy += y * y;
	}

	const denom = n * sxx - sx * sx;
	if (denom === 0) return null;

	const slope = (n * sxy - sx * sy) / denom;
	const intercept = (sy - slope * sx) / n;

	const rDenom = Math.sqrt(denom * (n * syy - sy * sy));
	const r = rDenom === 0 ? 0 : (n * sxy - sx * sy) / rDenom;

	return { slope, intercept, r2: r * r, predict: (x: number) => slope * x + intercept };
}
