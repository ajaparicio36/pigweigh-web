export function EstimationMode(): React.JSX.Element {
  return (
    <fieldset className="estimation-mode">
      <legend>Estimation mode</legend>
      <div className="estimation-mode-options">
        <div className="estimation-mode-option">
          <label>
            <input type="radio" name="estimation-mode" value="local" defaultChecked aria-describedby="local-mode-description" />
            <span>Local</span>
          </label>
          <p id="local-mode-description">Photo checks and estimates run on our server.</p>
        </div>
        <div className="estimation-mode-option">
          <label>
            <input type="radio" name="estimation-mode" value="cloud" disabled aria-describedby="cloud-mode-description" />
            <span>Cloud</span>
          </label>
          <p id="cloud-mode-description">Unavailable for now. The hosted workflow is awaiting verification.</p>
        </div>
      </div>
    </fieldset>
  );
}
