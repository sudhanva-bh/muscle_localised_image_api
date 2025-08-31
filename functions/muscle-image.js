const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// A list of valid muscle groups, just like in your PHP code
const availableMuscleGroups = new Set([
  "all", "all_lower", "all_upper", "abductors", "abs", "adductors", "back", 
  "back_lower", "back_upper", "biceps", "calfs", "chest", "core", "core_lower", 
  "core_upper", "forearms", "gluteus", "hamstring", "hands", "latissimus", 
  "legs", "neck", "quadriceps", "shoulders", "shoulders_back", "shoulders_front", 
  "triceps"
]);

// Helper function to create tinted image layers
async function createTintedLayer(muscle, colorRgb) {
  // Security check: only process valid muscle groups
  if (!availableMuscleGroups.has(muscle)) {
    console.warn(`Invalid muscle group requested: ${muscle}`);
    return null;
  }
  
  const musclePath = path.resolve(__dirname, `../images/${muscle}.png`);

  // Check if the image file exists before trying to process it
  if (!fs.existsSync(musclePath)) {
    console.warn(`Image file not found for muscle: ${muscle}`);
    return null;
  }

  // Tint the muscle image with the specified color and return it as a buffer
  return sharp(musclePath)
    .tint({ r: colorRgb[0], g: colorRgb[1], b: colorRgb[2] })
    .toBuffer();
}

// This is the main function Netlify will run
exports.handler = async (event) => {
  try {
    // 1. Get query parameters from the URL, providing default values
    const {
      primary_muscles = '',
      secondary_muscles = '',
      primary_color = '255,152,0',   // Default orange
      secondary_color = '255,211,144', // Default light orange
      transparent = '0',
    } = event.queryStringParameters;

    // 2. Choose the correct base image
    const baseImagePath = transparent === '1'
      ? path.resolve(__dirname, '../images/baseImage_transparent.png')
      : path.resolve(__dirname, '../images/baseImage.png');

    // 3. Prepare the muscle layers
    const compositeLayers = [];
    const primaryMuscles = primary_muscles.split(',').filter(Boolean);
    const secondaryMuscles = secondary_muscles.split(',').filter(Boolean);

    const primaryColorRgb = primary_color.split(',').map(Number);
    const secondaryColorRgb = secondary_color.split(',').map(Number);

    // Create tinted primary muscle layers in parallel
    const primaryPromises = primaryMuscles.map(muscle => createTintedLayer(muscle, primaryColorRgb));
    // Create tinted secondary muscle layers in parallel
    const secondaryPromises = secondaryMuscles.map(muscle => createTintedLayer(muscle, secondaryColorRgb));
    
    // Wait for all image processing to complete
    const allLayers = await Promise.all([...primaryPromises, ...secondaryPromises]);
    
    // Add the processed layers to the composite list, filtering out any that failed
    for (const layerBuffer of allLayers) {
      if (layerBuffer) {
        compositeLayers.push({ input: layerBuffer });
      }
    }

    // 4. Generate the final image by compositing the layers onto the base
    const finalImageBuffer = await sharp(baseImagePath)
      .composite(compositeLayers)
      .png()
      .toBuffer();

    // 5. Return the final image as a Base64 encoded string
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'image/png' },
      body: finalImageBuffer.toString('base64'),
      isBase64Encoded: true, // This is crucial for Netlify to handle binary data
    };
  } catch (error) {
    console.error('Error generating image:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to generate image.', details: error.message }),
    };
  }
};