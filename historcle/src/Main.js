import React, { useState } from 'react';
import './Main.css';

function MainApp() {
  const [guess, setGuess] = useState('');
  const [answer] = useState(1969); // Hardcoded for this example

  const handleChange = (event) => {
    setGuess(event.target.value);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    // Add logic for checking the guess here
    alert(`Your guess is: ${guess}`);
  };
  return (
    <div className="App">
      <header className="App-header">
        <h1>Historcle</h1>
      </header>
      <div className="content">
        <h2>What year did this happen?</h2>
        <div className="image-container">
          <img src="your_image_url" alt="Historical Event" />
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="YYYY"
            value={guess}
            onChange={handleChange}
          />
          <button type="submit">Guess</button>
        </form>
      </div>
    </div>
  );
}

export default MainApp;
