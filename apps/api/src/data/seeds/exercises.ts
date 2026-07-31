/**
 * Exercise corpus seed (~40 movements, bodyweight / dumbbell / band).
 * Licence and licenceAuthor fields are NEVER stripped — attribution is an
 * AQF-12 obligation carried on every record (AQF-06 §3.3).
 */
import type { Equipment, Exercise, ExerciseExperience } from '@aquazerofit/shared';
import {
  applyCuratedMediaToExercise,
  readCuratedMediaRegistry,
  type CuratedMediaRegistry,
  type CuratedMediaResolutionOptions,
} from '../media/curatedMedia';

const MEDIA = [{ kind: 'image' as const, url: '/uploads/exercise-placeholder.svg' }];
const curatedMediaRegistry = readCuratedMediaRegistry();

export function finalizeSeedExerciseMedia(
  exercise: Exercise,
  registry: CuratedMediaRegistry = curatedMediaRegistry,
  options?: CuratedMediaResolutionOptions,
): Exercise {
  return applyCuratedMediaToExercise(exercise, registry, options);
}

let n = 0;
function ex(
  slug: string,
  name: string,
  category: Exercise['category'],
  primaryMuscles: string[],
  secondaryMuscles: string[],
  equipment: Equipment[],
  difficulty: ExerciseExperience,
  description: string,
): Exercise {
  n += 1;
  return finalizeSeedExerciseMedia({
    id: `ex-${slug}`,
    type: 'exercise',
    name,
    description,
    category,
    primaryMuscles,
    secondaryMuscles,
    equipment,
    difficulty,
    media: MEDIA,
    licence: 'CC-BY-SA 4.0',
    licenceAuthor: 'wger.de community contributors',
    sourceId: `wger-${String(100 + n)}`,
  });
}

export const exercisesSeed: Exercise[] = [
  // ---- Bodyweight strength ----
  ex('push-up', 'Push-Up', 'strength', ['chest'], ['triceps', 'shoulders', 'core'], ['none'], 'beginner',
    'Hands under shoulders, body in a straight line. Lower your chest to just above the floor, then press back up without letting your hips sag.'),
  ex('incline-push-up', 'Incline Push-Up', 'strength', ['chest'], ['triceps', 'shoulders'], ['none'], 'beginner',
    'Push-up with hands elevated on a stable surface. Reduces load — ideal while building towards full push-ups.'),
  ex('decline-push-up', 'Decline Push-Up', 'strength', ['chest'], ['shoulders', 'triceps'], ['none'], 'intermediate',
    'Push-up with feet elevated to shift emphasis to the upper chest and shoulders. Keep the core braced throughout.'),
  ex('diamond-push-up', 'Diamond Push-Up', 'strength', ['triceps'], ['chest', 'shoulders'], ['none'], 'intermediate',
    'Hands close together forming a diamond under the chest. Elbows track back along the ribs to load the triceps.'),
  ex('bodyweight-squat', 'Bodyweight Squat', 'strength', ['quadriceps'], ['glutes', 'hamstrings', 'core'], ['none'], 'beginner',
    'Feet shoulder-width, chest tall. Sit the hips back and down until thighs are parallel, then drive up through the mid-foot.'),
  ex('jump-squat', 'Jump Squat', 'strength', ['quadriceps'], ['glutes', 'calves'], ['none'], 'intermediate',
    'A squat finished with an explosive jump. Land softly with bent knees and immediately sink into the next rep.'),
  ex('walking-lunge', 'Walking Lunge', 'strength', ['quadriceps'], ['glutes', 'hamstrings'], ['none'], 'beginner',
    'Step forward and lower the back knee towards the floor, then push through the front heel into the next stride.'),
  ex('reverse-lunge', 'Reverse Lunge', 'strength', ['glutes'], ['quadriceps', 'hamstrings'], ['none'], 'beginner',
    'Step backwards into a lunge, keeping the front shin vertical. Gentler on the knees than the forward version.'),
  ex('bulgarian-split-squat', 'Bulgarian Split Squat', 'strength', ['quadriceps'], ['glutes', 'hamstrings'], ['bench'], 'advanced',
    'Rear foot elevated on a bench, drop the back knee straight down. A demanding single-leg strength builder.'),
  ex('glute-bridge', 'Glute Bridge', 'strength', ['glutes'], ['hamstrings', 'core'], ['none'], 'beginner',
    'Lying on your back, knees bent, drive the hips up until the body forms a straight line from knees to shoulders. Squeeze at the top.'),
  ex('single-leg-glute-bridge', 'Single-Leg Glute Bridge', 'strength', ['glutes'], ['hamstrings', 'core'], ['none'], 'intermediate',
    'Glute bridge performed one leg at a time. Keep the pelvis level as you drive up through the planted heel.'),
  ex('pike-push-up', 'Pike Push-Up', 'strength', ['shoulders'], ['triceps', 'chest'], ['none'], 'intermediate',
    'From a pike position with hips high, lower the crown of the head towards the floor and press back up. Builds pressing strength for the shoulders.'),
  ex('chair-dip', 'Bench Dip', 'strength', ['triceps'], ['chest', 'shoulders'], ['bench'], 'beginner',
    'Hands on the edge of a bench behind you, lower the hips until the elbows reach ninety degrees, then press up.'),
  ex('step-up', 'Step-Up', 'strength', ['quadriceps'], ['glutes', 'calves'], ['bench'], 'beginner',
    'Step onto a knee-height surface, driving through the leading heel. Control the descent — do not drop.'),
  ex('calf-raise', 'Standing Calf Raise', 'strength', ['calves'], [], ['none'], 'beginner',
    'Rise onto the balls of the feet, pause at the top, and lower slowly. Add a step edge for extra range.'),
  ex('wall-sit', 'Wall Sit', 'strength', ['quadriceps'], ['glutes', 'core'], ['none'], 'beginner',
    'Back flat against a wall, thighs parallel to the floor. Hold. Breathe steadily and keep the knees over the ankles.'),

  // ---- Dumbbell strength ----
  ex('db-goblet-squat', 'Dumbbell Goblet Squat', 'strength', ['quadriceps'], ['glutes', 'core'], ['dumbbells'], 'beginner',
    'Hold one dumbbell at your chest like a goblet. Squat between the knees, keeping the torso upright and elbows inside the thighs.'),
  ex('db-romanian-deadlift', 'Dumbbell Romanian Deadlift', 'strength', ['hamstrings'], ['glutes', 'lower back'], ['dumbbells'], 'intermediate',
    'Soft knees, hinge at the hips and slide the dumbbells down the thighs until you feel a hamstring stretch, then stand tall.'),
  ex('db-bench-press', 'Dumbbell Floor Press', 'strength', ['chest'], ['triceps', 'shoulders'], ['dumbbells'], 'beginner',
    'Lying on the floor or a mat, press the dumbbells from chest level to lockout. The floor limits range and protects the shoulders.'),
  ex('db-shoulder-press', 'Dumbbell Shoulder Press', 'strength', ['shoulders'], ['triceps', 'core'], ['dumbbells'], 'beginner',
    'Standing or seated, press the dumbbells from shoulder height to overhead without arching the lower back.'),
  ex('db-bent-over-row', 'Dumbbell Bent-Over Row', 'strength', ['back'], ['biceps', 'core'], ['dumbbells'], 'beginner',
    'Hinge to forty-five degrees with a flat back and row the dumbbells to your hips, squeezing the shoulder blades together.'),
  ex('db-single-arm-row', 'Single-Arm Dumbbell Row', 'strength', ['back'], ['biceps', 'core'], ['dumbbells', 'bench'], 'intermediate',
    'One hand braced on a bench, row the dumbbell to the hip with a long spine. Avoid rotating the torso.'),
  ex('db-bicep-curl', 'Dumbbell Bicep Curl', 'strength', ['biceps'], ['forearms'], ['dumbbells'], 'beginner',
    'Elbows pinned at your sides, curl the dumbbells up with control and lower over a slow three-count.'),
  ex('db-hammer-curl', 'Dumbbell Hammer Curl', 'strength', ['biceps'], ['forearms'], ['dumbbells'], 'beginner',
    'Curl with palms facing each other. Targets the brachialis for thicker, stronger arms.'),
  ex('db-overhead-triceps', 'Dumbbell Overhead Triceps Extension', 'strength', ['triceps'], ['shoulders', 'core'], ['dumbbells'], 'intermediate',
    'Hold one dumbbell overhead with both hands, lower it behind the head, and extend back to lockout keeping the elbows narrow.'),
  ex('db-lateral-raise', 'Dumbbell Lateral Raise', 'strength', ['shoulders'], [], ['dumbbells'], 'beginner',
    'Raise the dumbbells out to shoulder height with a slight elbow bend, leading with the elbows, then lower slowly.'),
  ex('db-reverse-fly', 'Dumbbell Reverse Fly', 'strength', ['back'], ['shoulders'], ['dumbbells'], 'intermediate',
    'Hinged forward, open the arms wide squeezing the rear shoulders and upper back. Light weight, strict form.'),
  ex('db-thruster', 'Dumbbell Thruster', 'strength', ['quadriceps'], ['shoulders', 'glutes', 'core'], ['dumbbells'], 'advanced',
    'Front squat into an overhead press in one fluid movement. A whole-body strength and conditioning staple.'),

  // ---- Resistance band ----
  ex('band-pull-apart', 'Band Pull-Apart', 'strength', ['back'], ['shoulders'], ['resistanceBands'], 'beginner',
    'Arms straight at chest height, pull the band apart until it touches the chest, squeezing the shoulder blades.'),
  ex('band-row', 'Seated Band Row', 'strength', ['back'], ['biceps'], ['resistanceBands'], 'beginner',
    'Band looped around the feet, row the handles to your ribs with a tall spine and controlled return.'),
  ex('band-chest-press', 'Band Chest Press', 'strength', ['chest'], ['triceps', 'shoulders'], ['resistanceBands'], 'beginner',
    'Band anchored behind you, press the handles forward to full extension without shrugging the shoulders.'),
  ex('band-squat', 'Band Squat', 'strength', ['quadriceps'], ['glutes'], ['resistanceBands'], 'beginner',
    'Stand on the band with handles at shoulder height, then squat against the band tension for accommodating resistance.'),
  ex('band-glute-kickback', 'Band Glute Kickback', 'strength', ['glutes'], ['hamstrings'], ['resistanceBands'], 'beginner',
    'On all fours with the band around one foot, drive the leg back and up, squeezing the glute at full extension.'),
  ex('band-lateral-walk', 'Band Lateral Walk', 'strength', ['glutes'], ['quadriceps'], ['resistanceBands'], 'beginner',
    'Band around the thighs, quarter-squat position, step sideways keeping constant tension. Excellent hip stability work.'),

  // ---- Core ----
  ex('plank', 'Plank', 'core', ['core'], ['shoulders', 'glutes'], ['none'], 'beginner',
    'Forearms down, body rigid from head to heels. Brace the abs and breathe — no sagging or piking.'),
  ex('side-plank', 'Side Plank', 'core', ['core'], ['shoulders'], ['none'], 'intermediate',
    'Stacked on one forearm, lift the hips until the body forms a straight line. Hold each side.'),
  ex('dead-bug', 'Dead Bug', 'core', ['core'], [], ['none'], 'beginner',
    'On your back, extend opposite arm and leg while keeping the lower back pressed into the mat. Slow and deliberate.'),
  ex('bicycle-crunch', 'Bicycle Crunch', 'core', ['core'], ['obliques'], ['none'], 'beginner',
    'Alternate elbow to opposite knee in a smooth pedalling rhythm. Keep the lower back down and neck relaxed.'),
  ex('russian-twist', 'Russian Twist', 'core', ['obliques'], ['core'], ['none'], 'intermediate',
    'Seated and leaning back slightly, rotate the torso side to side. Hold a dumbbell to progress.'),
  ex('leg-raise', 'Lying Leg Raise', 'core', ['core'], ['hip flexors'], ['none'], 'intermediate',
    'Legs straight, raise them to vertical and lower slowly without letting the lower back arch off the mat.'),
  ex('mountain-climber', 'Mountain Climber', 'core', ['core'], ['shoulders', 'quadriceps'], ['none'], 'beginner',
    'From a high plank, drive the knees towards the chest in alternation. Quick feet, quiet hips.'),

  // ---- Cardio ----
  ex('jumping-jacks', 'Jumping Jacks', 'cardio', ['full body'], ['calves', 'shoulders'], ['none'], 'beginner',
    'Jump the feet wide while sweeping the arms overhead, then return. A classic pulse-raiser.'),
  ex('high-knees', 'High Knees', 'cardio', ['full body'], ['quadriceps', 'core'], ['none'], 'beginner',
    'Run on the spot driving the knees to hip height. Stay tall and pump the arms.'),
  ex('burpee', 'Burpee', 'cardio', ['full body'], ['chest', 'quadriceps', 'core'], ['none'], 'intermediate',
    'Squat, kick back to a plank, push-up, jump the feet in and leap. The complete conditioning movement.'),
  ex('skater-jump', 'Skater Jump', 'cardio', ['full body'], ['glutes', 'quadriceps'], ['none'], 'intermediate',
    'Bound laterally from one leg to the other like a speed skater, landing softly with control.'),
  ex('jump-rope', 'Jump Rope', 'cardio', ['full body'], ['calves', 'shoulders'], ['jumpRope'], 'beginner',
    'Light, quick bounces on the balls of the feet, wrists doing the turning. Superb cardio density.'),
  ex('shadow-boxing', 'Shadow Boxing', 'cardio', ['full body'], ['shoulders', 'core'], ['none'], 'beginner',
    'Throw combinations against the air with footwork. Keep the guard up and the core engaged.'),

  // ---- Mobility ----
  ex('cat-cow', 'Cat-Cow Stretch', 'mobility', ['spine'], ['core'], ['yogaMat'], 'beginner',
    'On all fours, alternate between arching and rounding the spine in time with your breath.'),
  ex('worlds-greatest-stretch', "World's Greatest Stretch", 'mobility', ['hips'], ['hamstrings', 'spine'], ['none'], 'beginner',
    'Deep lunge with a rotation and reach towards the ceiling. Opens hips, hamstrings and thoracic spine in one flow.'),
  ex('downward-dog', 'Downward Dog', 'mobility', ['hamstrings'], ['calves', 'shoulders'], ['yogaMat'], 'beginner',
    'Hips high, heels reaching for the floor, spine long. Pedal the feet to ease into the stretch.'),
  ex('hip-flexor-stretch', 'Half-Kneeling Hip Flexor Stretch', 'mobility', ['hips'], ['quadriceps'], ['yogaMat'], 'beginner',
    'In a half-kneeling position, tuck the pelvis and shift forward gently until you feel the front of the hip lengthen.'),
];
