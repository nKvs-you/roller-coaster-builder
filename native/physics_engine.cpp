/**
 * Roller Coaster Physics Engine - C++ Core
 * Compiled to WebAssembly via Emscripten
 * 
 * Provides high-performance physics calculations for:
 * - Track spline interpolation (Catmull-Rom)
 * - Physics simulation (gravity, friction, g-forces)
 * - Collision detection
 * - Track validation and analysis
 */

#include <emscripten/emscripten.h>
#include <emscripten/bind.h>
#include <cmath>
#include <vector>
#include <string>
#include <algorithm>
#include <memory>

using namespace emscripten;

// ============================================================================
// Vector3 Class
// ============================================================================

class Vec3 {
public:
    double x, y, z;
    
    Vec3() : x(0), y(0), z(0) {}
    Vec3(double x_, double y_, double z_) : x(x_), y(y_), z(z_) {}
    
    Vec3 operator+(const Vec3& v) const { return Vec3(x + v.x, y + v.y, z + v.z); }
    Vec3 operator-(const Vec3& v) const { return Vec3(x - v.x, y - v.y, z - v.z); }
    Vec3 operator*(double s) const { return Vec3(x * s, y * s, z * s); }
    Vec3 operator/(double s) const { return Vec3(x / s, y / s, z / s); }
    
    Vec3& operator+=(const Vec3& v) { x += v.x; y += v.y; z += v.z; return *this; }
    Vec3& operator-=(const Vec3& v) { x -= v.x; y -= v.y; z -= v.z; return *this; }
    Vec3& operator*=(double s) { x *= s; y *= s; z *= s; return *this; }
    
    double dot(const Vec3& v) const { return x * v.x + y * v.y + z * v.z; }
    
    Vec3 cross(const Vec3& v) const {
        return Vec3(
            y * v.z - z * v.y,
            z * v.x - x * v.z,
            x * v.y - y * v.x
        );
    }
    
    double length() const { return std::sqrt(x * x + y * y + z * z); }
    double lengthSq() const { return x * x + y * y + z * z; }
    
    Vec3 normalized() const {
        double len = length();
        if (len < 1e-10) return Vec3(0, 1, 0);
        return *this / len;
    }
    
    void normalize() {
        double len = length();
        if (len > 1e-10) {
            x /= len; y /= len; z /= len;
        }
    }
    
    double distanceTo(const Vec3& v) const {
        return (*this - v).length();
    }
    
    Vec3 lerp(const Vec3& v, double t) const {
        return *this * (1.0 - t) + v * t;
    }
};

// ============================================================================
// Track Point Data
// ============================================================================

struct TrackPointData {
    Vec3 position;
    double tilt;
    bool hasLoop;
    double loopRadius;
    double loopPitch;
    
    TrackPointData() : tilt(0), hasLoop(false), loopRadius(8), loopPitch(12) {}
};

// ============================================================================
// Physics State
// ============================================================================

struct PhysicsState {
    Vec3 position;
    Vec3 velocity;
    Vec3 acceleration;
    double speed;          // m/s
    double gForceVertical; // G's
    double gForceLateral;  // G's
    double gForceTotal;    // G's
    double progress;       // 0-1 along track
    double height;         // meters
    bool isOnChainLift;
    bool isInLoop;
    double bankAngle;      // radians
};

// ============================================================================
// Track Sample Result
// ============================================================================

struct TrackSample {
    Vec3 point;
    Vec3 tangent;
    Vec3 up;
    Vec3 right;
    double tilt;
    bool inLoop;
    double curvature;  // 1/radius
    double grade;      // percentage
};

// ============================================================================
// Catmull-Rom Spline
// ============================================================================

class CatmullRomSpline {
private:
    std::vector<Vec3> points;
    std::vector<double> arcLengths;
    double totalLength;
    bool isLooped;
    double tension;
    
public:
    CatmullRomSpline() : totalLength(0), isLooped(false), tension(0.5) {}
    
    void setPoints(const std::vector<Vec3>& pts, bool looped, double t = 0.5) {
        points = pts;
        isLooped = looped;
        tension = t;
        computeArcLengths();
    }
    
    void computeArcLengths() {
        arcLengths.clear();
        totalLength = 0;
        
        if (points.size() < 2) return;
        
        int segments = isLooped ? points.size() : points.size() - 1;
        int samplesPerSegment = 50;
        
        arcLengths.push_back(0);
        
        Vec3 prevPoint = getPointRaw(0);
        
        for (int i = 1; i <= segments * samplesPerSegment; i++) {
            double t = static_cast<double>(i) / (segments * samplesPerSegment);
            Vec3 currPoint = getPointRaw(t);
            double dist = prevPoint.distanceTo(currPoint);
            totalLength += dist;
            prevPoint = currPoint;
        }
    }
    
    Vec3 getPointRaw(double t) const {
        if (points.size() < 2) return Vec3();
        
        int n = points.size();
        int segments = isLooped ? n : n - 1;
        
        double scaledT = t * segments;
        int i = static_cast<int>(std::floor(scaledT));
        double frac = scaledT - i;
        
        if (isLooped) {
            i = ((i % n) + n) % n;
        } else {
            i = std::max(0, std::min(i, segments - 1));
            if (i == segments - 1) frac = 1.0;
        }
        
        // Get the 4 control points for Catmull-Rom
        int p0, p1, p2, p3;
        if (isLooped) {
            p0 = ((i - 1) % n + n) % n;
            p1 = i;
            p2 = (i + 1) % n;
            p3 = (i + 2) % n;
        } else {
            p0 = std::max(0, i - 1);
            p1 = i;
            p2 = std::min(n - 1, i + 1);
            p3 = std::min(n - 1, i + 2);
        }
        
        return catmullRomInterpolate(
            points[p0], points[p1], points[p2], points[p3], frac, tension
        );
    }
    
    Vec3 catmullRomInterpolate(
        const Vec3& p0, const Vec3& p1, const Vec3& p2, const Vec3& p3, 
        double t, double alpha
    ) const {
        double t2 = t * t;
        double t3 = t2 * t;
        
        double a = -alpha;
        double b = 2.0 - alpha;
        double c = alpha - 2.0;
        double d = alpha;
        
        Vec3 result;
        result.x = 0.5 * ((2.0 * p1.x) + 
            (-p0.x + p2.x) * t + 
            (2.0 * p0.x - 5.0 * p1.x + 4.0 * p2.x - p3.x) * t2 + 
            (-p0.x + 3.0 * p1.x - 3.0 * p2.x + p3.x) * t3);
        result.y = 0.5 * ((2.0 * p1.y) + 
            (-p0.y + p2.y) * t + 
            (2.0 * p0.y - 5.0 * p1.y + 4.0 * p2.y - p3.y) * t2 + 
            (-p0.y + 3.0 * p1.y - 3.0 * p2.y + p3.y) * t3);
        result.z = 0.5 * ((2.0 * p1.z) + 
            (-p0.z + p2.z) * t + 
            (2.0 * p0.z - 5.0 * p1.z + 4.0 * p2.z - p3.z) * t2 + 
            (-p0.z + 3.0 * p1.z - 3.0 * p2.z + p3.z) * t3);
        
        return result;
    }
    
    Vec3 getTangent(double t) const {
        double epsilon = 0.0001;
        Vec3 p1 = getPointRaw(std::max(0.0, t - epsilon));
        Vec3 p2 = getPointRaw(std::min(1.0, t + epsilon));
        return (p2 - p1).normalized();
    }
    
    double getCurvature(double t) const {
        double epsilon = 0.0001;
        Vec3 t1 = getTangent(std::max(0.0, t - epsilon));
        Vec3 t2 = getTangent(std::min(1.0, t + epsilon));
        
        double angle = std::acos(std::max(-1.0, std::min(1.0, t1.dot(t2))));
        double arcLen = getPointRaw(t - epsilon).distanceTo(getPointRaw(t + epsilon));
        
        if (arcLen < 1e-10) return 0;
        return angle / arcLen;  // curvature = dθ/ds
    }
    
    double getTotalLength() const { return totalLength; }
    int getPointCount() const { return points.size(); }
    bool getIsLooped() const { return isLooped; }
};

// ============================================================================
// Physics Constants
// ============================================================================

constexpr double GRAVITY = 9.81;           // m/s²
constexpr double AIR_RESISTANCE = 0.02;    // drag coefficient
constexpr double ROLLING_FRICTION = 0.015; // friction coefficient
constexpr double CHAIN_LIFT_SPEED = 3.0;   // m/s constant chain lift speed
constexpr double MAX_SAFE_G_FORCE = 5.0;   // G's
constexpr double MIN_SAFE_G_FORCE = -1.5;  // G's (negative = ejector airtime)
constexpr double COMFORT_G_LATERAL = 1.5;  // G's

// ============================================================================
// Physics Engine
// ============================================================================

class PhysicsEngine {
private:
    CatmullRomSpline spline;
    std::vector<TrackPointData> trackPoints;
    PhysicsState state;
    
    double simulationTime;
    double deltaTime;
    bool hasChainLift;
    double firstPeakProgress;
    
    // Force history for smoothing
    std::vector<double> gForceHistory;
    int gForceHistorySize = 10;
    
public:
    PhysicsEngine() : simulationTime(0), deltaTime(1.0/60.0), 
                      hasChainLift(false), firstPeakProgress(0.2) {
        reset();
    }
    
    void setTrack(const std::vector<TrackPointData>& points, bool isLooped) {
        trackPoints = points;
        
        std::vector<Vec3> positions;
        for (const auto& p : points) {
            positions.push_back(p.position);
        }
        
        spline.setPoints(positions, isLooped, 0.5);
        
        // Find first peak for chain lift
        findFirstPeak();
        
        reset();
    }
    
    void findFirstPeak() {
        if (trackPoints.size() < 3) {
            firstPeakProgress = 0.2;
            return;
        }
        
        double maxHeight = trackPoints[0].position.y;
        int peakIndex = 0;
        
        for (size_t i = 1; i < trackPoints.size(); i++) {
            if (trackPoints[i].position.y > maxHeight) {
                maxHeight = trackPoints[i].position.y;
                peakIndex = i;
            }
        }
        
        int segments = spline.getIsLooped() ? trackPoints.size() : trackPoints.size() - 1;
        firstPeakProgress = static_cast<double>(peakIndex) / segments;
        firstPeakProgress = std::min(0.5, std::max(0.1, firstPeakProgress));
    }
    
    void setChainLift(bool enabled) {
        hasChainLift = enabled;
    }
    
    void reset() {
        state.position = spline.getPointRaw(0);
        state.velocity = Vec3(0, 0, 0);
        state.acceleration = Vec3(0, 0, 0);
        state.speed = 1.0;  // Start with minimal speed
        state.gForceVertical = 1.0;
        state.gForceLateral = 0.0;
        state.gForceTotal = 1.0;
        state.progress = 0;
        state.height = state.position.y;
        state.isOnChainLift = hasChainLift;
        state.isInLoop = false;
        state.bankAngle = 0;
        
        simulationTime = 0;
        gForceHistory.clear();
    }
    
    PhysicsState step(double dt) {
        if (trackPoints.size() < 2) return state;
        
        deltaTime = dt;
        simulationTime += dt;
        
        // Get track sample at current position
        TrackSample sample = sampleTrack(state.progress);
        
        // Calculate physics forces
        Vec3 gravity(0, -GRAVITY, 0);
        
        // Project gravity onto track direction
        double gravityAlongTrack = gravity.dot(sample.tangent);
        
        // Check if on chain lift section
        state.isOnChainLift = hasChainLift && state.progress < firstPeakProgress;
        
        // Calculate speed
        if (state.isOnChainLift) {
            // Chain lift: constant speed upward
            state.speed = CHAIN_LIFT_SPEED;
        } else {
            // Physics-based speed calculation
            double dragForce = AIR_RESISTANCE * state.speed * state.speed;
            double frictionForce = ROLLING_FRICTION * GRAVITY;
            
            double netAcceleration = -gravityAlongTrack - dragForce - frictionForce;
            
            state.speed += netAcceleration * dt;
            state.speed = std::max(0.5, state.speed);  // Minimum speed
        }
        
        // Calculate G-forces
        calculateGForces(sample, dt);
        
        // Update position along track
        double distanceTraveled = state.speed * dt;
        double trackLength = spline.getTotalLength();
        
        if (trackLength > 0) {
            state.progress += distanceTraveled / trackLength;
            
            // Handle looping or stopping
            if (spline.getIsLooped()) {
                while (state.progress >= 1.0) state.progress -= 1.0;
                while (state.progress < 0) state.progress += 1.0;
            } else {
                if (state.progress >= 1.0) {
                    state.progress = 0;  // Restart
                    reset();
                }
            }
        }
        
        // Update state position and vectors
        sample = sampleTrack(state.progress);
        state.position = sample.point;
        state.velocity = sample.tangent * state.speed;
        state.height = sample.point.y;
        state.bankAngle = sample.tilt;
        state.isInLoop = sample.inLoop;
        
        return state;
    }
    
    void calculateGForces(const TrackSample& sample, double dt) {
        // Centripetal acceleration (v²/r)
        double centripetalAccel = 0;
        if (sample.curvature > 1e-6) {
            double radius = 1.0 / sample.curvature;
            centripetalAccel = (state.speed * state.speed) / radius;
        }
        
        // Vertical G-force: normal force needed to keep on track
        // G = 1 + (centripetal_accel_vertical_component / g)
        double gradeRad = std::atan(sample.grade / 100.0);
        double vertComponent = std::cos(gradeRad) * centripetalAccel;
        
        state.gForceVertical = 1.0 + vertComponent / GRAVITY;
        
        // Add effect of going up/down hills
        state.gForceVertical += std::sin(gradeRad) * (state.speed * state.speed) / (GRAVITY * 10);
        
        // Lateral G-force from banking
        state.gForceLateral = std::sin(sample.tilt) * centripetalAccel / GRAVITY;
        
        // Total G-force magnitude
        state.gForceTotal = std::sqrt(
            state.gForceVertical * state.gForceVertical + 
            state.gForceLateral * state.gForceLateral
        );
        
        // Smooth G-forces
        gForceHistory.push_back(state.gForceTotal);
        if (gForceHistory.size() > gForceHistorySize) {
            gForceHistory.erase(gForceHistory.begin());
        }
        
        double smoothedG = 0;
        for (double g : gForceHistory) smoothedG += g;
        state.gForceTotal = smoothedG / gForceHistory.size();
    }
    
    TrackSample sampleTrack(double progress) {
        TrackSample sample;
        
        progress = std::max(0.0, std::min(0.9999, progress));
        
        sample.point = spline.getPointRaw(progress);
        sample.tangent = spline.getTangent(progress);
        sample.curvature = spline.getCurvature(progress);
        
        // Calculate up vector (perpendicular to tangent, toward world up)
        Vec3 worldUp(0, 1, 0);
        Vec3 right = sample.tangent.cross(worldUp).normalized();
        sample.up = right.cross(sample.tangent).normalized();
        sample.right = right;
        
        // Interpolate tilt from track points
        sample.tilt = interpolateTilt(progress);
        
        // Apply tilt rotation to up/right vectors
        if (std::abs(sample.tilt) > 0.001) {
            double c = std::cos(sample.tilt);
            double s = std::sin(sample.tilt);
            Vec3 newUp = sample.up * c + sample.right * s;
            Vec3 newRight = sample.right * c - sample.up * s;
            sample.up = newUp;
            sample.right = newRight;
        }
        
        // Calculate grade (slope percentage)
        sample.grade = sample.tangent.y * 100.0;
        
        // Check if in loop
        sample.inLoop = isInLoopAtProgress(progress);
        
        return sample;
    }
    
    double interpolateTilt(double progress) {
        if (trackPoints.size() < 2) return 0;
        
        int n = trackPoints.size();
        int segments = spline.getIsLooped() ? n : n - 1;
        
        double scaledT = progress * segments;
        int index = static_cast<int>(std::floor(scaledT));
        double frac = scaledT - index;
        
        if (spline.getIsLooped()) {
            int i0 = ((index % n) + n) % n;
            int i1 = ((index + 1) % n + n) % n;
            return trackPoints[i0].tilt * (1.0 - frac) + trackPoints[i1].tilt * frac;
        } else {
            if (index >= n - 1) return trackPoints[n - 1].tilt;
            return trackPoints[index].tilt * (1.0 - frac) + trackPoints[index + 1].tilt * frac;
        }
    }
    
    bool isInLoopAtProgress(double progress) {
        // Simplified: check if near a loop point
        if (trackPoints.empty()) return false;
        
        int n = trackPoints.size();
        int segments = spline.getIsLooped() ? n : n - 1;
        
        for (size_t i = 0; i < trackPoints.size(); i++) {
            if (trackPoints[i].hasLoop) {
                double loopProgress = static_cast<double>(i) / segments;
                double loopLength = 0.05;  // Approximate loop length as % of track
                
                if (progress >= loopProgress && progress < loopProgress + loopLength) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    // Getters for JS access
    double getSpeed() const { return state.speed; }
    double getGForceVertical() const { return state.gForceVertical; }
    double getGForceLateral() const { return state.gForceLateral; }
    double getGForceTotal() const { return state.gForceTotal; }
    double getProgress() const { return state.progress; }
    double getHeight() const { return state.height; }
    bool getIsOnChainLift() const { return state.isOnChainLift; }
    bool getIsInLoop() const { return state.isInLoop; }
    double getPositionX() const { return state.position.x; }
    double getPositionY() const { return state.position.y; }
    double getPositionZ() const { return state.position.z; }
    double getVelocityX() const { return state.velocity.x; }
    double getVelocityY() const { return state.velocity.y; }
    double getVelocityZ() const { return state.velocity.z; }
    
    void setProgress(double p) { state.progress = p; }
    void setSpeed(double s) { state.speed = s; }
};

// ============================================================================
// Track Validator
// ============================================================================

struct ValidationResult {
    bool isValid;
    std::string message;
    int severity; // 0 = info, 1 = warning, 2 = error
    int pointIndex;
    double value;
};

class TrackValidator {
public:
    static std::vector<ValidationResult> validate(
        const std::vector<TrackPointData>& points, 
        bool isLooped
    ) {
        std::vector<ValidationResult> results;
        
        if (points.size() < 2) {
            results.push_back({false, "Need at least 2 points", 2, -1, 0});
            return results;
        }
        
        CatmullRomSpline spline;
        std::vector<Vec3> positions;
        for (const auto& p : points) {
            positions.push_back(p.position);
        }
        spline.setPoints(positions, isLooped, 0.5);
        
        // Check each segment
        int segments = isLooped ? points.size() : points.size() - 1;
        
        for (int i = 0; i < segments; i++) {
            double tStart = static_cast<double>(i) / segments;
            double tEnd = static_cast<double>(i + 1) / segments;
            
            // Sample multiple points along segment
            for (int s = 0; s < 10; s++) {
                double t = tStart + (tEnd - tStart) * s / 10.0;
                Vec3 tangent = spline.getTangent(t);
                
                // Check grade (steepness)
                double grade = std::abs(tangent.y) * 100.0;
                if (grade > 80) {
                    results.push_back({
                        false, 
                        "Extreme grade detected (" + std::to_string(static_cast<int>(grade)) + "%)",
                        2, i, grade
                    });
                } else if (grade > 60) {
                    results.push_back({
                        false,
                        "Steep grade (" + std::to_string(static_cast<int>(grade)) + "%)",
                        1, i, grade
                    });
                }
                
                // Check curvature (tight turns)
                double curvature = spline.getCurvature(t);
                if (curvature > 0.5) {  // radius < 2m
                    results.push_back({
                        false,
                        "Turn radius too tight",
                        2, i, 1.0 / curvature
                    });
                } else if (curvature > 0.25) {  // radius < 4m
                    results.push_back({
                        false,
                        "Sharp turn detected",
                        1, i, 1.0 / curvature
                    });
                }
            }
            
            // Check point height
            if (points[i].position.y < 0.5) {
                results.push_back({
                    false,
                    "Point too low (underground risk)",
                    1, i, points[i].position.y
                });
            }
        }
        
        // Check for self-intersection (simplified)
        checkSelfIntersection(spline, results, segments);
        
        if (results.empty()) {
            results.push_back({true, "Track validation passed", 0, -1, 0});
        }
        
        return results;
    }
    
private:
    static void checkSelfIntersection(
        CatmullRomSpline& spline,
        std::vector<ValidationResult>& results,
        int segments
    ) {
        // Sample track at regular intervals
        std::vector<Vec3> samples;
        int numSamples = segments * 5;
        
        for (int i = 0; i < numSamples; i++) {
            double t = static_cast<double>(i) / numSamples;
            samples.push_back(spline.getPointRaw(t));
        }
        
        // Check for close points that aren't adjacent
        double minDistance = 2.0;  // meters
        
        for (size_t i = 0; i < samples.size(); i++) {
            for (size_t j = i + 5; j < samples.size(); j++) {
                double dist = samples[i].distanceTo(samples[j]);
                if (dist < minDistance) {
                    results.push_back({
                        false,
                        "Possible self-intersection detected",
                        1, 
                        static_cast<int>(i * segments / numSamples),
                        dist
                    });
                    return;  // Only report first intersection
                }
            }
        }
    }
};

// ============================================================================
// Collision Detection
// ============================================================================

class CollisionDetector {
public:
    struct AABB {
        Vec3 min, max;
        
        bool intersects(const AABB& other) const {
            return (min.x <= other.max.x && max.x >= other.min.x) &&
                   (min.y <= other.max.y && max.y >= other.min.y) &&
                   (min.z <= other.max.z && max.z >= other.min.z);
        }
        
        bool containsPoint(const Vec3& p) const {
            return p.x >= min.x && p.x <= max.x &&
                   p.y >= min.y && p.y <= max.y &&
                   p.z >= min.z && p.z <= max.z;
        }
    };
    
    static AABB computeTrackBounds(const std::vector<TrackPointData>& points) {
        AABB bounds;
        bounds.min = Vec3(1e10, 1e10, 1e10);
        bounds.max = Vec3(-1e10, -1e10, -1e10);
        
        for (const auto& p : points) {
            bounds.min.x = std::min(bounds.min.x, p.position.x);
            bounds.min.y = std::min(bounds.min.y, p.position.y);
            bounds.min.z = std::min(bounds.min.z, p.position.z);
            bounds.max.x = std::max(bounds.max.x, p.position.x);
            bounds.max.y = std::max(bounds.max.y, p.position.y);
            bounds.max.z = std::max(bounds.max.z, p.position.z);
        }
        
        // Add some padding
        Vec3 padding(2, 2, 2);
        bounds.min -= padding;
        bounds.max += padding;
        
        return bounds;
    }
    
    static bool checkGroundCollision(const Vec3& position, double groundHeight = 0) {
        return position.y < groundHeight + 0.5;  // 0.5m clearance
    }
};

// ============================================================================
// Emscripten Bindings
// ============================================================================

EMSCRIPTEN_BINDINGS(physics_engine) {
    // Vec3 class
    class_<Vec3>("Vec3")
        .constructor<>()
        .constructor<double, double, double>()
        .property("x", &Vec3::x)
        .property("y", &Vec3::y)
        .property("z", &Vec3::z)
        .function("length", &Vec3::length)
        .function("normalized", &Vec3::normalized)
        .function("dot", &Vec3::dot)
        .function("distanceTo", &Vec3::distanceTo);
    
    // TrackPointData struct
    class_<TrackPointData>("TrackPointData")
        .constructor<>()
        .property("position", &TrackPointData::position)
        .property("tilt", &TrackPointData::tilt)
        .property("hasLoop", &TrackPointData::hasLoop)
        .property("loopRadius", &TrackPointData::loopRadius)
        .property("loopPitch", &TrackPointData::loopPitch);
    
    // PhysicsState struct
    class_<PhysicsState>("PhysicsState")
        .property("speed", &PhysicsState::speed)
        .property("gForceVertical", &PhysicsState::gForceVertical)
        .property("gForceLateral", &PhysicsState::gForceLateral)
        .property("gForceTotal", &PhysicsState::gForceTotal)
        .property("progress", &PhysicsState::progress)
        .property("height", &PhysicsState::height)
        .property("isOnChainLift", &PhysicsState::isOnChainLift)
        .property("isInLoop", &PhysicsState::isInLoop)
        .property("bankAngle", &PhysicsState::bankAngle);
    
    // TrackSample struct
    class_<TrackSample>("TrackSample")
        .property("point", &TrackSample::point)
        .property("tangent", &TrackSample::tangent)
        .property("up", &TrackSample::up)
        .property("right", &TrackSample::right)
        .property("tilt", &TrackSample::tilt)
        .property("inLoop", &TrackSample::inLoop)
        .property("curvature", &TrackSample::curvature)
        .property("grade", &TrackSample::grade);
    
    // ValidationResult struct  
    class_<ValidationResult>("ValidationResult")
        .property("isValid", &ValidationResult::isValid)
        .property("message", &ValidationResult::message)
        .property("severity", &ValidationResult::severity)
        .property("pointIndex", &ValidationResult::pointIndex)
        .property("value", &ValidationResult::value);
    
    // PhysicsEngine class
    class_<PhysicsEngine>("PhysicsEngine")
        .constructor<>()
        .function("setChainLift", &PhysicsEngine::setChainLift)
        .function("reset", &PhysicsEngine::reset)
        .function("getSpeed", &PhysicsEngine::getSpeed)
        .function("getGForceVertical", &PhysicsEngine::getGForceVertical)
        .function("getGForceLateral", &PhysicsEngine::getGForceLateral)
        .function("getGForceTotal", &PhysicsEngine::getGForceTotal)
        .function("getProgress", &PhysicsEngine::getProgress)
        .function("getHeight", &PhysicsEngine::getHeight)
        .function("getIsOnChainLift", &PhysicsEngine::getIsOnChainLift)
        .function("getIsInLoop", &PhysicsEngine::getIsInLoop)
        .function("getPositionX", &PhysicsEngine::getPositionX)
        .function("getPositionY", &PhysicsEngine::getPositionY)
        .function("getPositionZ", &PhysicsEngine::getPositionZ)
        .function("getVelocityX", &PhysicsEngine::getVelocityX)
        .function("getVelocityY", &PhysicsEngine::getVelocityY)
        .function("getVelocityZ", &PhysicsEngine::getVelocityZ)
        .function("setProgress", &PhysicsEngine::setProgress)
        .function("setSpeed", &PhysicsEngine::setSpeed);
    
    // Vector registration for arrays
    register_vector<TrackPointData>("TrackPointDataVector");
    register_vector<ValidationResult>("ValidationResultVector");
    register_vector<Vec3>("Vec3Vector");
    
    // TrackValidator static methods
    class_<TrackValidator>("TrackValidator")
        .class_function("validate", &TrackValidator::validate);
    
    // CollisionDetector static methods
    class_<CollisionDetector>("CollisionDetector")
        .class_function("checkGroundCollision", &CollisionDetector::checkGroundCollision);
}
