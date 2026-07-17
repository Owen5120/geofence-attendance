const Datastore = require('nedb');

// Initialize two isolated local database collections
const db = {
    sessions: new Datastore({ filename: 'database/sessions.db', autoload: true }),
    logs: new Datastore({ filename: 'database/attendance_logs.db', autoload: true }),
    students: new Datastore({ filename: 'database/students.db', autoload: true })
};

// Helper to create a new lecture session (Lecturer Action)
function createActiveSession(courseCode, lat, lng, noiseBase, durationMinutes, callback) {
    const expiresAt = new Date(Date.now() + durationMinutes * 60000);
    
    const sessionDoc = {
        courseCode: courseCode,
        latitude: lat,
        longitude: lng,
        baseNoise: noiseBase,
        baseTemp: 26.0,
        createdAt: new Date(),
        expiresAt: expiresAt,
        isActive: true
    };

    // Deactivate any older sessions for this course first
    db.sessions.update({ courseCode: courseCode, isActive: true }, { $set: { isActive: false } }, { multi: true }, () => {
        db.sessions.insert(sessionDoc, (err, newDoc) => {
            callback(err, newDoc);
        });
    });
}

// Helper to log verified attendance (Student Action)
function logAttendance(studentId, studentName, courseCode, telemetry, isVerified, score, callback) {
    const logDoc = {
        studentId: studentId,
        studentName: studentName,
        courseCode: courseCode,
        timestamp: new Date(),
        telemetry: telemetry,
        isVerified: isVerified,
        confidenceScore: score
    };

    db.logs.insert(logDoc, (err, newDoc) => {
        callback(err, newDoc);
    });
}

// Helper to fetch history for export or display
function getAttendanceHistory(courseCode, callback) {
    db.logs.find({ courseCode: courseCode }).sort({ timestamp: -1 }).exec((err, docs) => {
        callback(err, docs);
    });
}

module.exports = {
    createActiveSession,
    logAttendance,
    getAttendanceHistory,
    db
};