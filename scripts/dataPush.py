from pymongo import MongoClient
import json
from bson import ObjectId
from datetime import datetime
import os

collector_id ="673da5ab19f19aab72d2fdf5"

# MongoDB connection
client = MongoClient('mongodb://127.0.0.1:27017/')  # Update with your MongoDB connection string
db = client['data']  # Update with your database name

# Helper function to insert and get ID
def insert_and_get_id(collection, data, unique_field):
    try:
        # Try to insert the document
        result = collection.insert_one(data)
        return result.inserted_id
    except Exception as e:
        # If document exists, get its ID
        existing_doc = collection.find_one({unique_field: data[unique_field]})
        if existing_doc:
            return existing_doc['_id']
        raise e

# Load JSON data
# list files starting with bio_
fileNames = [f for f in os.listdir() if f.startswith("bio_")]
fileNames.extend(['data.json', 'data1.json'])
data_list = []

for fileName in fileNames:
    with open(fileName, 'r') as file:
        data_list.extend(json.load(file))

for data in data_list:
    try:
        # Process each record
        # 1. Insert/Get IDs for degrees in educations
        education_ids = []
        for edu in data['educations']:
            # Insert/Get degree
            degree_id = insert_and_get_id(
                db.degrees,
                {'degree': edu['degree']['degree']},
                'degree'
            )

            # Insert/Get college
            college_data = {
                'collegeName': edu['college']['collegeName'],
                'city': edu['college']['city'],
                'state': edu['college']['state'],
                'country': edu['college']['country']
            }
            college_id = insert_and_get_id(
                db.colleges,
                college_data,
                "None"
            )

            # Insert education
            education_data = {
                'degree': degree_id,
                'college': college_id
            }
            education_id = insert_and_get_id(
                db.educations,
                education_data,
                'degree'
            )
            education_ids.append(education_id)

        # 2. Process stages
        stage_ids = []
        for stage in data['stages']:
            # Insert/Get skills
            skill_ids = []
            for skill in stage['skills']:
                skill_id = insert_and_get_id(
                    db.skills,
                    {'skillName': skill['skillName']},
                    'skillName'
                )
                skill_ids.append(skill_id)

            # Insert/Get job
            job_id = insert_and_get_id(
                db.jobs,
                {'job': stage['job']['job']},
                'job'
            )

            # Insert/Get degree
            degree_id = insert_and_get_id(
                db.degrees,
                {'degree': stage['degree']['degree']},
                'degree'
            )

            # Insert/Get living condition
            living_condition_id = insert_and_get_id(
                db.livingconditions,
                {'livingCondition': stage['livingCondition']['livingCondition']},
                'livingCondition'
            )

            # Insert stage
            stage_data = {
                'stageType': stage['stageType'],
                'degree': degree_id,
                'job': job_id,
                'experience': stage['experience'],
                'skills': skill_ids,
                'livingCondition': living_condition_id,
                'assistance': stage['assistance'],
                'motivation': stage['motivation'],
                'suggestion': stage['suggestion']
            }
            stage_id = insert_and_get_id(
                db.stages,
                stage_data,
                'stageType'  # Note: This might need adjustment based on your uniqueness criteria
            )
            stage_ids.append(stage_id)

        # 3. Process interests
        interest_ids = []
        for interest in data['interests']:
            interest_id = insert_and_get_id(
                db.interests,
                {'interest': interest['interest']},
                'interest'
            )
            interest_ids.append(interest_id)

        # 4. Process skills
        skill_ids = []
        for skill in data['skills']:
            skill_id = insert_and_get_id(
                db.skills,
                {'skillName': skill['skillName']},
                'skillName'
            )
            skill_ids.append(skill_id)

        # 5. Create main document
        cpmap_data = {
            'name': data['name'],
            'city': data['city'],
            'address': data['address'],
            'state': data['state'],
            'country': data['country'],
            'email': data['email'],
            'mobileNumber': data['mobileNumber'],
            'personalWebsite': data['personalWebsite'],
            'socialNetworkLink': data['socialNetworkLink'],
            'gender': data['gender'],
            'religion': data['religion'],
            'caste': data['caste'],
            'economicStatus': data['economicStatus'],
            'background': data['background'],
            'currentOccupation': data['currentOccupation'],
            'currentSalary': data['currentSalary'],
            'skills': skill_ids,
            'advice': data['advice'],
            'educations': education_ids,
            'interests': interest_ids,
            'stages': stage_ids,
            'status': "Pending",
            'verified_by': None,
            'owner': ObjectId(collector_id),
        }

        # Insert main document
        result = db.cpmapentries.insert_one(cpmap_data)
        print(f"Successfully inserted document with ID: {result.inserted_id}")
        
        # add this entry to the collector's forms
        db.collectors.find_one_and_update(
						{"userid": ObjectId(collector_id),},
						{"$push": {"Forms": result.inserted_id}},
					)

    except Exception as e:
        print(f"Error processing record: {data['name']}")
        print(f"Error details: {str(e)}")
        continue

print("Data import completed!")