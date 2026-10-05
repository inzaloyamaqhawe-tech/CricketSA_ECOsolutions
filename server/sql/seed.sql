-- Cricket ECO Solutions starter data.
-- The existing table names remain for compatibility with the reference app shell.

INSERT INTO venues (name, city)
SELECT * FROM (VALUES
  ('National Federation Office', 'Johannesburg'),
  ('Regional Cricket Hub', 'Cape Town'),
  ('Provincial Development Centre', 'Durban'),
  ('District Cricket Office', 'Centurion'),
  ('Community Club Pilot', 'Gqeberha')
) AS v(name, city)
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE venues.name = v.name);

INSERT INTO volunteer_roles (name, department, description, pass_threshold)
SELECT * FROM (VALUES
  ('Player Production', 'Talent Pathway', 'Structured player development from grassroots cricket to club, district, regional and national level.', 70),
  ('Database Management', 'Federation Records', 'Secure central records for players, clubs, coaches, umpires, scorers and officials.', 70),
  ('Reports Basket', 'Board Reporting', 'Ready-made and custom reports for the board, selectors, administrators, funders and partners.', 70),
  ('Fixtures', 'Competition Operations', 'League and tournament scheduling, venue allocation, scoring, results, tables and notifications.', 70),
  ('Empowerment', 'Training and Compliance', 'Training hub for coaching, administration, safeguarding, anti-corruption and first aid certification.', 70)
) AS r(name, department, description, pass_threshold)
WHERE NOT EXISTS (SELECT 1 FROM volunteer_roles WHERE volunteer_roles.name = r.name);

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, name FROM volunteer_roles LOOP
    IF EXISTS (SELECT 1 FROM screening_questions WHERE role_id = r.id) THEN
      CONTINUE;
    END IF;

    INSERT INTO screening_questions (role_id, question, option_a, option_b, is_knockout, pass_option, sort_order) VALUES
    (r.id,
     'Is your federation or cricket organisation ready to participate in a discovery workshop for this module?',
     'Yes, we can participate', 'Not yet', true, 'A', 1),
    (r.id,
     'Do you agree that sensitive player and child data must be handled only by authorised users?',
     'Yes, authorised access only', 'No / unsure', true, 'A', 2);

    INSERT INTO screening_questions (role_id, question, option_a, option_b, option_c, points_a, points_b, points_c, sort_order) VALUES
    (r.id,
     'How important is this module for your first rollout?',
     'Critical for launch', 'Important after the first phase', 'Useful later', 10, 7, 4, 3),
    (r.id,
     'How ready is your current data or process for migration?',
     'Clean and available', 'Available but needs cleaning', 'Mostly manual or missing', 10, 7, 3, 4),
    (r.id,
     'Which delivery approach would fit best?',
     'Pilot first, then national rollout', 'Full launch after discovery', 'Still deciding internally', 10, 8, 4, 5);
  END LOOP;
END $$;
