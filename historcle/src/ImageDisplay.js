import React from 'react';

function ImageDisplay() {
  // In a real app, you'd fetch an image based on the current date
  const imageUrl = 'path_to_your_historical_image.jpg';

  return (
    <div className="image-display">
      <img src={imageUrl} alt="Historical event" />
    </div>
  );
}

export default ImageDisplay;