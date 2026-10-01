const mongoose = require('mongoose');
const fs = require('fs');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/cp-data', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Define schemas
const {CPMapEntry} = require('../models/CPMapEntryModel'); // Assuming CPMapEntry schema is defined in a separate file
const {Education} = require('../models/educationModel'); // Assuming Education schema is defined in a separate file
const {Stage} = require('../models/stageModel'); // Assuming Stage schema is defined in a separate file
const {Qualification} = require('../models/qualificationModel'); // Assuming Qualification schema is defined in a separate file
const {Skill} = require('../models/skillModel'); // Assuming Skill schema is defined in a separate file

// Read sample JSON data
const jsonData = fs.readFileSync('transformedData.json', 'utf8');
const data = JSON.parse(jsonData);

// Function to randomize options for specified fields
function getRandomOption(optionsArray) {
  return optionsArray[Math.floor(Math.random() * optionsArray.length)];
}

// Function to save data to MongoDB
async function saveDataToMongoDB() {
  try {
    // Iterate over CPMapEntry data
    for (const entry of data) {
      // Randomize options for specified fields
      entry.city = getRandomOption(locations).city;
      entry.pinCode = getRandomOption(locations).pincode;
      entry.state = getRandomOption(locations).state;
      entry.religion = getRandomOption(religionOptions);
      entry.caste = getRandomOption(casteOptions);
      entry.economicStatus = getRandomOption(economicOptions);
      entry.background = getRandomOption(backgroundOptions);

      // Create and save Qualification documents
      const educationIds = [];
      for (const educationData of entry.education) {
        const qualification = await Qualification.create({
          qualification: educationData.qualification,
          institution: educationData.collegeName, // Assuming collegeName corresponds to institution in Qualification schema
        });
        const education = await Education.create({
          qualification: qualification._id,
          collegeCity: educationData.collegeCity,
          from: educationData.from,
          to: educationData.to,
          collegeAddress: educationData.collegeAddress,
        });
        educationIds.push(education._id);
      }

      // Create and save Stage documents
      const stageIds = [];
      for (const stageData of entry.stages) {
        const skills = [];
        for (const skillData of stageData.skills) {
          const skill = await Skill.create({
            skill: skillData.skill,
            effort: skillData.effort,
          });
          skills.push(skill._id);
        }
        const stage = await Stage.create({
          stageName: stageData.stageName,
          stageType: stageData.stageType,
          skills: skills,
          from: stageData.from,
          to: stageData.to,
          motivation: stageData.motivation,
          learnings: stageData.learnings,
          suggestions: stageData.suggestions,
        });
        stageIds.push(stage._id);
      }

      // Create and save CPMapEntry document
      await CPMapEntry.create({
        name: entry.name,
        city: entry.city,
        state: entry.state,
        pinCode: entry.pinCode,
        address: entry.address,
        email: entry.email,
        mobileNumber: entry.mobileNumber,
        personalWebsite: entry.personalWebsite,
        socialNetworkLink: entry.socialNetworkLink,
        gender: entry.gender,
        religion: entry.religion,
        caste: entry.caste,
        economicStatus: entry.economicStatus,
        background: entry.background,
        currentOccupation: entry.currentOccupation,
        educations: educationIds,
        stages: stageIds,
        status: entry.status,
        verified_by: entry.verified_by,
      });
    }
    console.log('Data saved to MongoDB successfully!');
  } catch (error) {
    console.error('Error saving data to MongoDB:', error);
  } finally {
    // Disconnect from MongoDB
    mongoose.disconnect();
  }
}

// Call function to save data to MongoDB
saveDataToMongoDB();