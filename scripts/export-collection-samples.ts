// scripts/export-collection-samples.ts
//
// READ ONLY MongoDB collection inspector.
//
// Prints first N documents from every important collection.
// Used for AI/code review to understand actual database shape.
//
// Usage:
// npm run db:samples
//
// Optional:
// npm run db:samples -- 5

import { MongoClient, Document } from "mongodb";
import * as dotenv from "dotenv";
import * as fs from "fs";

dotenv.config();

const LIMIT = Number(process.argv[2]) || 3;

const OUTPUT_FILE = `db-samples-${new Date()
  .toISOString()
  .replace(/[:.]/g, "-")}.txt`;

const outputStream = fs.createWriteStream(
  OUTPUT_FILE,
  { flags: "w" }
);

const originalLog = console.log;

console.log = (...args: any[]) => {

  originalLog(...args);

  outputStream.write(
    args.join(" ") + "\n"
  );

};


const COLLECTIONS = [
  "tblorganizations",
  "tbladmin",

  "tblvehicles",
  "tbldrivers",

  "tblexpenses",
  "tblfuellogs",
  "tbltrips",

  "tblreminders",
  "tblworkorders",

  "tblnotifications",

  "tblorgunits",

  "tblfuelcards",
  "tblfuelstations",

  "tblvendors",
  "tblinvoices",
  "tblpurchaseorders",

  "tblspareparts",
  "tblstockmovements",

  "tblreportdefinitions",
  "tbldashboards",

  "tbltelematics",
  "tblbookings",
];


function printDivider(title:string){
  console.log("\n");
  console.log("=".repeat(90));
  console.log(title);
  console.log("=".repeat(90));
}


function cleanDocument(doc:Document){

  const clone = structuredClone(doc);

  if(clone._id){
    clone._id = String(clone._id);
  }

  return clone;
}


async function main(){

  const uri = process.env.MONGODB_URI;

  if(!uri){
    throw new Error(
      "MONGODB_URI missing"
    );
  }


  const client = new MongoClient(uri);

  await client.connect();


  const db = client.db("VehicleExpense");


  console.log(`
========================================================
MONGODB COLLECTION SAMPLE EXPORT
Database: ${db.databaseName}
Samples per collection: ${LIMIT}
Generated: ${new Date().toISOString()}
========================================================
`);


  const existing =
    await db.listCollections().toArray();


  const existingNames =
    new Set(existing.map(c=>c.name));


  for(const collectionName of COLLECTIONS){


    printDivider(
      `COLLECTION: ${collectionName}`
    );


    if(!existingNames.has(collectionName)){

      console.log(
        "STATUS: COLLECTION DOES NOT EXIST"
      );

      continue;
    }


    const collection =
      db.collection(collectionName);


    const count =
      await collection.countDocuments();


    console.log(
      `TOTAL DOCUMENTS: ${count}`
    );


    if(count===0){

      console.log(
        "STATUS: EMPTY COLLECTION"
      );

      continue;
    }


    const docs =
      await collection
        .find({})
        .limit(LIMIT)
        .toArray();


    console.log(
      `SHOWING FIRST ${docs.length} DOCUMENTS`
    );


    docs.forEach((doc,index)=>{

      console.log(
        `\n--- DOCUMENT ${index+1} ---`
      );


      console.log(
        JSON.stringify(
          cleanDocument(doc),
          null,
          2
        )
      );

    });

  }


  await client.close();


  outputStream.end();

  originalLog(
    `\nOUTPUT SAVED: ${OUTPUT_FILE}`
  );


}


main()
.catch(err=>{

  console.error(
    "Export failed:",
    err
  );

  outputStream.end();

  process.exit(1);

});