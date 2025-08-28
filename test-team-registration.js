// チーム登録（選手なし）のテストスクリプト
async function testTeamRegistrationWithoutPlayers() {
  console.log('Testing team registration without players...');

  const testData = {
    team_name: 'テストチーム（選手なし）',
    team_omission: 'テスト',
    contact_person: 'テスト太郎',
    contact_email: 'test@example.com',
    contact_phone: '090-1234-5678',
    tournament_team_name: 'テストチーム（選手なし）',
    tournament_team_omission: 'テスト',
    players: [], // 選手なし
    temporary_password: 'temp1234'
  };

  try {
    const response = await fetch('http://localhost:3000/api/admin/tournaments/3/teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Test passed: Team registration without players succeeded');
      console.log('Team ID:', result.data.team_id);
      console.log('Players count:', result.data.players_count);
    } else {
      console.log('❌ Test failed:', result.error);
      if (result.details) {
        console.log('Details:', result.details);
      }
    }
  } catch (error) {
    console.log('❌ Test error:', error.message);
  }
}

// 開発サーバーが起動しているかチェック
fetch('http://localhost:3000/api/tournaments')
  .then(() => {
    console.log('Development server is running');
    testTeamRegistrationWithoutPlayers();
  })
  .catch(() => {
    console.log('Development server is not running. Please start with: npm run dev');
  });