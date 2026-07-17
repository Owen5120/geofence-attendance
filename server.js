// ==================================================
// MODERN NODE.JS COMPATIBILITY PATCH FOR NEDB
// ==================================================
const util = require('util');
if (!util.isDate) {
    util.isDate = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    };
}
if (!util.isArray) {
    util.isArray = Array.isArray;
}
if (!util.isRegExp) {
    util.isRegExp = function (obj) {
        return Object.prototype.toString.call(obj) === '[object RegExp]';
    };
}
// ==================================================

// Global OS check for Python runner environment
const pythonCmd = process.platform === 'win32' ? 'py' : 'python3';

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { execFile } = require('child_process'); 
const dbManager = require('./database');

const app = express();
const PORT = process.env.PORT || 5000; 

app.use(cors());
app.use(bodyParser.json());

// Haversine Formula: Calculates absolute distance in meters between two coordinates
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radius of the earth in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; 
}

// Main Endpoint: Validate Student Presence using the Machine Learning Model
app.post('/api/verify-attendance', (req, res) => {
    const { studentId, courseCode, latitude, longitude, noiseLevel, temperature } = req.body;
    
    const targetCourse = (courseCode || "CSC413").trim().toUpperCase(); 
    const targetStudentId = (studentId || "").trim().toUpperCase();

    // 1. GATE REJECTION: Look up the incoming student ID
    dbManager.db.students.findOne({ matricNo: targetStudentId }, (studentErr, studentRecord) => {
        if (studentErr || !studentRecord) {
            return res.json({ 
                success: true, 
                verified: false, 
                message: `Attendance Denied. Matriculation Number (${targetStudentId}) is not registered on the university roster.` 
            });
        }

        const studentName = studentRecord.name; 
        const courseRegex = new RegExp(`^${targetCourse}$`, 'i');

        // 2. Look up the active session
        dbManager.db.sessions.findOne({ courseCode: courseRegex, isActive: true }, (err, activeSession) => {
            if (err || !activeSession) {
                return res.json({ 
                    success: true, 
                    verified: false, 
                    message: `Attendance Denied. No active session found for course: ${targetCourse}` 
                });
            }
            
            if (new Date() > new Date(activeSession.expiresAt)) {
                dbManager.db.sessions.update({ _id: activeSession._id }, { $set: { isActive: false } });
                return res.json({ success: true, verified: false, message: "Attendance Denied. The session window has closed." });
            }

            console.log(`\n[Incoming Request] Student Match Found: ${studentName} (${targetStudentId})`);
            
            // CORRECTED VARIABLES FOR THE LOGS
            console.log(`\n--- LIVE TELEMETRY COMPARE ---`);
            console.log(`Student:   Lat: ${latitude}, Lng: ${longitude}, Noise: ${noiseLevel}dB, Temp: ${temperature}°C`);
            console.log(`Lecturer:  Lat: ${activeSession.latitude}, Lng: ${activeSession.longitude}, Noise: ${activeSession.baseNoise}dB, Temp: ${activeSession.baseTemp || 26.2}°C`);
            console.log(`------------------------------\n`);
            
            console.log(`Passing live telemetry data vectors directly into trained model file...`);

            // 3. EXECUTE MACHINE LEARNING INFERENCE INTERFACE
            // Forwards 8 arguments dynamically using your pythonCmd environment flag
            execFile(pythonCmd, [
                'predict.py', 
                latitude, 
                longitude, 
                noiseLevel, 
                temperature,
                activeSession.latitude, 
                activeSession.longitude, 
                activeSession.baseNoise, 
                activeSession.baseTemp || 26.2
            ], (pyErr, stdout, stderr) => {
                                    
                let verified = false;
                let score = 0.0;
                
                if (!pyErr && stdout) {
                    try {
                        const mlOutput = JSON.parse(stdout.trim());
                        if (mlOutput.success) {
                            // Prediction values: 1 = Authentic (Verified), 0 = Fraudulent/Spoofed
                            verified = mlOutput.prediction === 1;
                            score = mlOutput.score;
                        }
                    } catch (parseErr) {
                        console.error("Failed to parse ML output JSON:", parseErr);
                    }
                } else {
                    console.error("Python worker pipeline execution failure:", stderr || pyErr);
                    verified = false;
                }

                const message = verified 
                    ? `Attendance Successfully Verified via ML Model! (Confidence: ${(score * 100).toFixed(1)}%)`
                    : "Attendance Denied. Machine Learning classification flags this telemetry signature as a spoof attempt.";

                // 4. Persist log row history alongside ML predictive metrics
                dbManager.logAttendance(targetStudentId, studentName, activeSession.courseCode, { latitude, longitude, noiseLevel, temperature }, verified, score, (logErr) => {
                    if (logErr) console.error("Database Write Failed:", logErr);
                    
                    return res.json({
                        success: true,
                        verified: verified,
                        score: score,
                        message: message
                    });
                });
            });
        });
    });
});

// Endpoint: Lecturer Action to create a dynamic session anywhere
app.post('/api/create-session', (req, res) => {
    const { courseCode, latitude, longitude, baseNoise, durationMinutes } = req.body;
    
    dbManager.createActiveSession(courseCode, latitude, longitude, baseNoise, durationMinutes, (err, newSession) => {
        if (err) {
            console.error("Session creation failed:", err);
            return res.status(500).json({ success: false });
        }
        console.log(`\n[Database Configuration] New tracking perimeter initialized for ${courseCode} at (${latitude}, ${longitude}) with Ambient Baseline: ${baseNoise} dB.`);
        return res.json({ success: true, session: newSession });
    });
});

// Endpoint: Fetch complete historical log for dashboard or exports
app.get('/api/attendance-history', (req, res) => {
    dbManager.getAttendanceHistory("CSC413", (err, logs) => {
        if (err) {
            console.error("Database read error:", err);
            return res.status(500).json({ success: false });
        }
        return res.json(logs || []);
    });
});

// ==================================================
// AUTOMATIC DATABASE SEEDER (FULL 100 STUDENTS ROSTER)
// ==================================================
dbManager.db.students.count({}, (err, count) => {
    if (count === 0) {
        console.log("Database file empty or cleared. Injecting full 100-student roster safely...");
        
        const roster = [
            {"matricNo":"DEL/2022/001","name":"Victor Udeh","dept":"Computer Science","fingerprintHash":"fp_vix_001","faceEmbedId":"embed_vix_001"},
            {"matricNo":"DEL/2022/002","name":"Alexander Carter","dept":"Computer Science","fingerprintHash":"fp_alex_002","faceEmbedId":"embed_alex_002"},
            {"matricNo":"DEL/2022/003","name":"Elizabeth Smith","dept":"Computer Science","fingerprintHash":"fp_eliz_003","faceEmbedId":"embed_eliz_003"},
            {"matricNo":"DEL/2022/004","name":"James Kingsley","dept":"Computer Science","fingerprintHash":"fp_jame_004","faceEmbedId":"embed_jame_004"},
            {"matricNo":"DEL/2022/005","name":"Benjamin Bradley","dept":"Computer Science","fingerprintHash":"fp_ben_005","faceEmbedId":"embed_ben_005"},
            {"matricNo":"DEL/2022/006","name":"Sophia Vance","dept":"Computer Science","fingerprintHash":"fp_soph_006","faceEmbedId":"embed_soph_006"},
            {"matricNo":"DEL/2022/007","name":"William Hayes","dept":"Computer Science","fingerprintHash":"fp_will_007","faceEmbedId":"embed_will_007"},
            {"matricNo":"DEL/2022/008","name":"Grace Wellington","dept":"Computer Science","fingerprintHash":"fp_grace_008","faceEmbedId":"embed_grace_008"},
            {"matricNo":"DEL/2022/009","name":"Lucas Sterling","dept":"Computer Science","fingerprintHash":"fp_luca_009","faceEmbedId":"embed_luca_009"},
            {"matricNo":"DEL/2022/010","name":"Chloe Sterling","dept":"Computer Science","fingerprintHash":"fp_chlo_010","faceEmbedId":"embed_chlo_010"},
            {"matricNo":"DEL/2022/011","name":"Daniel Cross","dept":"Computer Science","fingerprintHash":"fp_dani_011","faceEmbedId":"embed_dani_011"},
            {"matricNo":"DEL/2022/012","name":"Olivia Bennett","dept":"Computer Science","fingerprintHash":"fp_oliv_012","faceEmbedId":"embed_oliv_012"},
            {"matricNo":"DEL/2022/013","name":"Matthew Rhodes","dept":"Computer Science","fingerprintHash":"fp_matt_013","faceEmbedId":"embed_matt_013"},
            {"matricNo":"DEL/2022/014","name":"Emily Watson","dept":"Computer Science","fingerprintHash":"fp_emil_014","faceEmbedId":"embed_emil_014"},
            {"matricNo":"DEL/2022/015","name":"Andrew Finch","dept":"Computer Science","fingerprintHash":"fp_andr_015","faceEmbedId":"embed_andr_015"},
            {"matricNo":"DEL/2022/016","name":"Madison Briggs","dept":"Computer Science","fingerprintHash":"fp_madi_016","faceEmbedId":"embed_madi_016"},
            {"matricNo":"DEL/2022/017","name":"Joshua Stone","dept":"Computer Science","fingerprintHash":"fp_josh_017","faceEmbedId":"embed_josh_017"},
            {"matricNo":"DEL/2022/018","name":"Hannah Vance","dept":"Computer Science","fingerprintHash":"fp_hann_018","faceEmbedId":"embed_hann_018"},
            {"matricNo":"DEL/2022/019","name":"Christopher Blake","dept":"Computer Science","fingerprintHash":"fp_chris_019","faceEmbedId":"embed_chris_019"},
            {"matricNo":"DEL/2022/020","name":"Ashley Thorne","dept":"Computer Science","fingerprintHash":"fp_ashl_020","faceEmbedId":"embed_ashl_020"},
            {"matricNo":"DEL/2022/021","name":"Joseph Brooks","dept":"Computer Science","fingerprintHash":"fp_jose_021","faceEmbedId":"embed_jose_021"},
            {"matricNo":"DEL/2022/022","name":"Sarah Jenkins","dept":"Computer Science","fingerprintHash":"fp_sara_022","faceEmbedId":"embed_sara_022"},
            {"matricNo":"DEL/2022/023","name":"David Miller","dept":"Computer Science","fingerprintHash":"fp_davi_023","faceEmbedId":"embed_davi_023"},
            {"matricNo":"DEL/2022/024","name":"Jessica Taylor","dept":"Computer Science","fingerprintHash":"fp_jess_024","faceEmbedId":"embed_jess_024"},
            {"matricNo":"DEL/2022/025","name":"John Anderson","dept":"Computer Science","fingerprintHash":"fp_john_025","faceEmbedId":"embed_john_025"},
            {"matricNo":"DEL/2022/026","name":"Megan Thomas","dept":"Computer Science","fingerprintHash":"fp_mega_026","faceEmbedId":"embed_mega_026"},
            {"matricNo":"DEL/2022/027","name":"Ryan Martinez","dept":"Computer Science","fingerprintHash":"fp_ryan_027","faceEmbedId":"embed_ryan_027"},
            {"matricNo":"DEL/2022/028","name":"Lauren Robinson","dept":"Computer Science","fingerprintHash":"fp_laur_028","faceEmbedId":"embed_laur_028"},
            {"matricNo":"DEL/2022/029","name":"Nicholas Clark","dept":"Computer Science","fingerprintHash":"fp_nich_029","faceEmbedId":"embed_nich_029"},
            {"matricNo":"DEL/2022/030","name":"Victoria Rodriguez","dept":"Computer Science","fingerprintHash":"fp_vict_030","faceEmbedId":"embed_vict_030"},
            {"matricNo":"DEL/2022/031","name":"Jonathan Lewis","dept":"Computer Science","fingerprintHash":"fp_jona_031","faceEmbedId":"embed_jona_031"},
            {"matricNo":"DEL/2022/032","name":"Rachel Lee","dept":"Computer Science","fingerprintHash":"fp_rach_032","faceEmbedId":"embed_rach_032"},
            {"matricNo":"DEL/2022/033","name":"Justin Walker","dept":"Computer Science","fingerprintHash":"fp_just_033","faceEmbedId":"embed_just_033"},
            {"matricNo":"DEL/2022/034","name":"Amanda Hall","dept":"Computer Science","fingerprintHash":"fp_aman_034","faceEmbedId":"embed_aman_034"},
            {"matricNo":"DEL/2022/035","name":"Brandon Allen","dept":"Computer Science","fingerprintHash":"fp_bran_035","faceEmbedId":"embed_bran_035"},
            {"matricNo":"DEL/2022/036","name":"Stephanie Young","dept":"Computer Science","fingerprintHash":"fp_step_036","faceEmbedId":"embed_step_036"},
            {"matricNo":"DEL/2022/037","name":"Emmeline King","dept":"Computer Science","fingerprintHash":"fp_emme_037","faceEmbedId":"embed_emme_037"},
            {"matricNo":"DEL/2022/038","name":"Nicole Wright","dept":"Computer Science","fingerprintHash":"fp_nico_038","faceEmbedId":"embed_nico_038"},
            {"matricNo":"DEL/2022/039","name":"Samuel Scott","dept":"Computer Science","fingerprintHash":"fp_samu_039","faceEmbedId":"embed_samu_039"},
            {"matricNo":"DEL/2022/040","name":"Elizabeth Green","dept":"Computer Science","fingerprintHash":"fp_eliz_040","faceEmbedId":"embed_eliz_040"},
            {"matricNo":"DEL/2022/041","name":"Tyler Adams","dept":"Computer Science","fingerprintHash":"fp_tyle_041","faceEmbedId":"embed_tyle_041"},
            {"matricNo":"DEL/2022/042","name":"Katherine Baker","dept":"Computer Science","fingerprintHash":"fp_kath_042","faceEmbedId":"embed_kath_042"},
            {"matricNo":"DEL/2022/043","name":"Alexander Gonzalez","dept":"Computer Science","fingerprintHash":"fp_alex_043","faceEmbedId":"embed_alex_043"},
            {"matricNo":"DEL/2022/044","name":"Amy Nelson","dept":"Computer Science","fingerprintHash":"fp_amyn_044","faceEmbedId":"embed_amyn_044"},
            {"matricNo":"DEL/2022/045","name":"Kevin Carter","dept":"Computer Science","fingerprintHash":"fp_kevi_045","faceEmbedId":"embed_kevi_045"},
            {"matricNo":"DEL/2022/046","name":"Christine Mitchell","dept":"Computer Science","fingerprintHash":"fp_chri_046","faceEmbedId":"embed_chri_046"},
            {"matricNo":"DEL/2022/047","name":"Brian Perez","dept":"Computer Science","fingerprintHash":"fp_bria_047","faceEmbedId":"embed_bria_047"},
            {"matricNo":"DEL/2022/048","name":"Melissa Roberts","dept":"Computer Science","fingerprintHash":"fp_meli_048","faceEmbedId":"embed_meli_048"},
            {"matricNo":"DEL/2022/049","name":"Timothy Turner","dept":"Computer Science","fingerprintHash":"fp_timo_049","faceEmbedId":"embed_timo_049"},
            {"matricNo":"DEL/2022/050","name":"Rebecca Phillips","dept":"Computer Science","fingerprintHash":"fp_rebe_050","faceEmbedId":"embed_rebe_050"},
            {"matricNo":"DEL/2022/051","name":"Aaron Campbell","dept":"Computer Science","fingerprintHash":"fp_aaro_051","faceEmbedId":"embed_aaro_051"},
            {"matricNo":"DEL/2022/052","name":"Laura Parker","dept":"Computer Science","fingerprintHash":"fp_laur_052","faceEmbedId":"embed_laur_052"},
            {"matricNo":"DEL/2022/053","name":"Richard Evans","dept":"Computer Science","fingerprintHash":"fp_rich_053","faceEmbedId":"embed_rich_053"},
            {"matricNo":"DEL/2022/054","name":"Kimberly Edwards","dept":"Computer Science","fingerprintHash":"fp_kimb_054","faceEmbedId":"embed_kimb_054"},
            {"matricNo":"DEL/2022/055","name":"Jeffrey Collins","dept":"Computer Science","fingerprintHash":"fp_jeff_055","faceEmbedId":"embed_jeff_055"},
            {"matricNo":"DEL/2022/056","name":"Crystal Stewart","dept":"Computer Science","fingerprintHash":"fp_crys_056","faceEmbedId":"embed_crys_056"},
            {"matricNo":"DEL/2022/057","name":"Charles Morris","dept":"Computer Science","fingerprintHash":"fp_char_057","faceEmbedId":"embed_char_057"},
            {"matricNo":"DEL/2022/058","name":"Michelle Rogers","dept":"Computer Science","fingerprintHash":"fp_mich_058","faceEmbedId":"embed_mich_058"},
            {"matricNo":"DEL/2022/059","name":"Daniel Reed","dept":"Computer Science","fingerprintHash":"fp_dani_059","faceEmbedId":"embed_dani_059"},
            {"matricNo":"DEL/2022/060","name":"Tiffany Cook","dept":"Computer Science","fingerprintHash":"fp_tiff_060","faceEmbedId":"embed_tiff_060"},
            {"matricNo":"DEL/2022/061","name":"Matthew Morgan","dept":"Computer Science","fingerprintHash":"fp_matt_061","faceEmbedId":"embed_matt_061"},
            {"matricNo":"DEL/2022/062","name":"Amber Bell","dept":"Computer Science","fingerprintHash":"fp_ambe_062","faceEmbedId":"embed_ambe_062"},
            {"matricNo":"DEL/2022/063","name":"Christopher Murphy","dept":"Computer Science","fingerprintHash":"fp_chri_063","faceEmbedId":"embed_chri_063"},
            {"matricNo":"DEL/2022/064","name":"Danielle Bailey","dept":"Computer Science","fingerprintHash":"fp_dani_064","faceEmbedId":"embed_dani_064"},
            {"matricNo":"DEL/2022/065","name":"Paul Rivera","dept":"Computer Science","fingerprintHash":"fp_paul_065","faceEmbedId":"embed_paul_065"},
            {"matricNo":"DEL/2022/066","name":"Brittany Cooper","dept":"Computer Science","fingerprintHash":"fp_brit_066","faceEmbedId":"embed_brit_066"},
            {"matricNo":"DEL/2022/067","name":"Mark Richardson","dept":"Computer Science","fingerprintHash":"fp_mark_067","faceEmbedId":"embed_mark_067"},
            {"matricNo":"DEL/2022/068","name":"Heather Cox","dept":"Computer Science","fingerprintHash":"fp_heat_068","faceEmbedId":"embed_heat_068"},
            {"matricNo":"DEL/2022/069","name":"Donald Howard","dept":"Computer Science","fingerprintHash":"fp_dona_069","faceEmbedId":"embed_dona_069"},
            {"matricNo":"DEL/2022/070","name":"Diana Ward","dept":"Computer Science","fingerprintHash":"fp_dian_070","faceEmbedId":"embed_dian_070"},
            {"matricNo":"DEL/2022/071","name":"Steven Torres","dept":"Computer Science","fingerprintHash":"fp_stev_071","faceEmbedId":"embed_stev_071"},
            {"matricNo":"DEL/2022/072","name":"Christina Peterson","dept":"Computer Science","fingerprintHash":"fp_chri_072","faceEmbedId":"embed_chri_072"},
            {"matricNo":"DEL/2022/073","name":"Andrew Gray","dept":"Computer Science","fingerprintHash":"fp_andr_073","faceEmbedId":"embed_andr_073"},
            {"matricNo":"DEL/2022/074","name":"Joan Ramirez","dept":"Computer Science","fingerprintHash":"fp_joan_074","faceEmbedId":"embed_joan_074"},
            {"matricNo":"DEL/2022/075","name":"Joshua James","dept":"Computer Science","fingerprintHash":"fp_josh_075","faceEmbedId":"embed_josh_075"},
            {"matricNo":"DEL/2022/076","name":"Lisa Watson","dept":"Computer Science","fingerprintHash":"fp_lisa_076","faceEmbedId":"embed_lisa_076"},
            {"matricNo":"DEL/2022/077","name":"Kenneth Brooks","dept":"Computer Science","fingerprintHash":"fp_kenn_077","faceEmbedId":"embed_kenn_077"},
            {"matricNo":"DEL/2022/078","name":"Megan Kelly","dept":"Computer Science","fingerprintHash":"fp_mega_078","faceEmbedId":"embed_mega_078"},
            {"matricNo":"DEL/2022/079","name":"Kevin Sanders","dept":"Computer Science","fingerprintHash":"fp_kevi_079","faceEmbedId":"embed_kevi_079"},
            {"matricNo":"DEL/2022/080","name":"Sarah Price","dept":"Computer Science","fingerprintHash":"fp_sara_080","faceEmbedId":"embed_sara_080"},
            {"matricNo":"DEL/2022/081","name":"George Bennett","dept":"Computer Science","fingerprintHash":"fp_geor_081","faceEmbedId":"embed_geor_081"},
            {"matricNo":"DEL/2022/082","name":"Kimberly Wood","dept":"Computer Science","fingerprintHash":"fp_kimb_082","faceEmbedId":"embed_kimb_082"},
            {"matricNo":"DEL/2022/083","name":"Edward Barnes","dept":"Computer Science","fingerprintHash":"fp_edwa_083","faceEmbedId":"embed_edwa_083"},
            {"matricNo":"DEL/2022/084","name":"Jessica Ross","dept":"Computer Science","fingerprintHash":"fp_jess_084","faceEmbedId":"embed_jess_084"},
            {"matricNo":"DEL/2022/085","name":"Ronald Jenkins","dept":"Computer Science","fingerprintHash":"fp_rona_085","faceEmbedId":"embed_rona_085"},
            {"matricNo":"DEL/2022/086","name":"Mary Perry","dept":"Computer Science","fingerprintHash":"fp_mary_086","faceEmbedId":"embed_mary_086"},
            {"matricNo":"DEL/2022/087","name":"Timothy Long","dept":"Computer Science","fingerprintHash":"fp_timo_087","faceEmbedId":"embed_timo_087"},
            {"matricNo":"DEL/2022/088","name":"Maria Foster","dept":"Computer Science","fingerprintHash":"fp_mari_088","faceEmbedId":"embed_mari_088"},
            {"matricNo":"DEL/2022/089","name":"Jason Sanders","dept":"Computer Science","fingerprintHash":"fp_jaso_089","faceEmbedId":"embed_jaso_089"},
            {"matricNo":"DEL/2022/090","name":"Susan Bryant","dept":"Computer Science","fingerprintHash":"fp_susa_090","faceEmbedId":"embed_susa_090"},
            {"matricNo":"DEL/2022/091","name":"Jeffrey Long","dept":"Computer Science","fingerprintHash":"fp_jeff_091","faceEmbedId":"embed_jeff_091"},
            {"matricNo":"DEL/2022/092","name":"Margaret Patterson","dept":"Computer Science","fingerprintHash":"fp_marg_092","faceEmbedId":"embed_marg_092"},
            {"matricNo":"DEL/2022/093","name":"Ryan Hughes","dept":"Computer Science","fingerprintHash":"fp_ryan_093","faceEmbedId":"embed_ryan_093"},
            {"matricNo":"DEL/2022/094","name":"Lisa Flores","dept":"Computer Science","fingerprintHash":"fp_lisa_094","faceEmbedId":"embed_lisa_094"},
            {"matricNo":"DEL/2022/095","name":"Jacob Washington","dept":"Computer Science","fingerprintHash":"fp_jaco_095","faceEmbedId":"embed_jaco_095"},
            {"matricNo":"DEL/2022/096","name":"Dorothy Butler","dept":"Computer Science","fingerprintHash":"fp_doro_096","faceEmbedId":"embed_doro_096"},
            {"matricNo":"DEL/2022/097","name":"Gary Simmons","dept":"Computer Science","fingerprintHash":"fp_gary_097","faceEmbedId":"embed_gary_097"},
            {"matricNo":"DEL/2022/098","name":"Sandra Foster","dept":"Computer Science","fingerprintHash":"fp_sand_098","faceEmbedId":"embed_sand_098"},
            {"matricNo":"DEL/2022/099","name":"Nicholas Bryant","dept":"Computer Science","fingerprintHash":"fp_nich_099","faceEmbedId":"embed_nich_099"},
            {"matricNo":"DEL/2022/100","name":"Donna Alexander","dept":"Computer Science","fingerprintHash":"fp_donn_100","faceEmbedId":"embed_donn_100"}
        ];
        
        dbManager.db.students.insert(roster, (err, docs) => {
            if (err) console.error("Seeding failed:", err);
            else console.log(`Successfully written ${docs.length} student records into database storage natively!`);
        });
    } else {
        console.log(`Student roster verified. Active profiles found: ${count}`);
    }
});
// ==================================================

app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`Database-Integrated Server active on Port ${PORT}`);
    console.log(`==================================================`);
});