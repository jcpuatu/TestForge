import { casesToFeatureFile, parseFeatureFile } from './gherkin';

describe('gherkin parse/format round trip', () => {
  it('parses a feature file with multiple scenarios', () => {
    const text = `
      Feature: Login

      @smoke
      Scenario: Successful login
        Given I am on the login page
        When I enter valid credentials
        Then I should see the dashboard

      Scenario: Invalid password
        Given I am on the login page
        When I enter an invalid password
        Then I should see an error
    `;
    const parsed = parseFeatureFile(text);
    expect(parsed.featureName).toBe('Login');
    expect(parsed.scenarios).toHaveLength(2);
    expect(parsed.scenarios[0].name).toBe('Successful login');
    expect(parsed.scenarios[0].lines).toEqual([
      { keyword: 'Given', text: 'I am on the login page' },
      { keyword: 'When', text: 'I enter valid credentials' },
      { keyword: 'Then', text: 'I should see the dashboard' },
    ]);
  });

  it('skips comments, tags, and blank lines', () => {
    const parsed = parseFeatureFile('# a comment\n@tag\nFeature: X\n\nScenario: Y\nGiven a step');
    expect(parsed.featureName).toBe('X');
    expect(parsed.scenarios[0].lines).toEqual([{ keyword: 'Given', text: 'a step' }]);
  });

  it('formats cases back into a valid .feature file', () => {
    const text = casesToFeatureFile('Login', [
      { title: 'Successful login', bddLines: [{ keyword: 'Given', text: 'I am on the login page' }] },
    ]);
    expect(text).toContain('Feature: Login');
    expect(text).toContain('Scenario: Successful login');
    expect(text).toContain('Given I am on the login page');

    const reparsed = parseFeatureFile(text);
    expect(reparsed.featureName).toBe('Login');
    expect(reparsed.scenarios[0].name).toBe('Successful login');
  });
});
