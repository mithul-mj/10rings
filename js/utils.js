function getDistance3D(e1, e2) {
    const dx = e2.x - e1.x;
    const dy = e2.y - e1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function checkCollision3D(r1, r2) {
    if (r1.z > r2.z + r2.h || r2.z > r1.z + r1.h) return false;
    // Increased depth tolerance for easier mobile aiming and "head shot" perspective alignment
    const depth = 70;
    return (r1.x < r2.x + r2.w &&
        r1.x + r1.w > r2.x &&
        Math.abs(r1.y - r2.y) < depth);
}
