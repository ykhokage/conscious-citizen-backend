import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  secure: true,
});

async function main() {
  try {
    const result = await cloudinary.uploader.upload("./test-image.jpg", {
      folder: "conscious-citizen/test",
      resource_type: "image",
    });

    console.log("UPLOAD OK");
    console.log(result.secure_url);
  } catch (error) {
    console.error("UPLOAD ERROR:");
    console.error(error);
  }
}

main();